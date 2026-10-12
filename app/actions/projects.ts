'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { buildKnowledgeBlock } from '@/lib/ai/knowledge';
import { runIntake } from '@/lib/ai/intake';
import { generateResearchQueries, runPlanner } from '@/lib/ai/planner';
import { getActivePlaybooks } from '@/lib/data/knowledge';
import { researchQuestion } from '@/lib/ai/research';
import { draftProjectUpdate } from '@/lib/ai/update';
import { normaliseChecklist } from '@/lib/data/projects';
import { getStoredTavilyKey } from '@/lib/data/secrets';
import { SUPABASE_CONFIGURED } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export type ProjectFormState = { error: string | null };

const NOT_CONNECTED = {
  error: 'Supabase is not connected, so nothing can be saved yet.',
} as const;

const CURRENCIES = ['USD', 'EUR', 'GBP', 'PKR', 'AED', 'SAR', 'CAD', 'AUD'];

/**
 * Project intake. Saves the project first, so a slow or failed AI pass can
 * never lose the brief, then writes the restatement and the gap questions
 * over the top. One model call chain, inside the 60 second budget.
 */
export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  if (!SUPABASE_CONFIGURED) return NOT_CONNECTED;

  const title = String(formData.get('title') ?? '').trim();
  const brief = String(formData.get('brief') ?? '').trim();
  const clientId = String(formData.get('client_id') ?? '').trim();
  const deadline = String(formData.get('deadline') ?? '').trim();
  const budget = String(formData.get('budget_amount') ?? '').trim();
  const currency = String(formData.get('currency') ?? 'USD');
  const deliverables = String(formData.get('deliverables') ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(0, 12)
    .map((line) => line.slice(0, 300));

  if (title.length < 3) return { error: 'Give the project a short title.' };
  if (brief.length < 20) {
    return { error: 'Paste the real brief. Twenty characters minimum, the more context the smarter the questions.' };
  }
  if (clientId && !/^[0-9a-f-]{36}$/i.test(clientId)) return { error: 'That client does not exist.' };
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return { error: 'That deadline is not a date.' };
  if (budget && !/^\d+(\.\d{1,2})?$/.test(budget)) return { error: 'That budget is not a number.' };
  if (!CURRENCIES.includes(currency)) return { error: 'Unknown currency.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session expired. Sign in again.' };

  let clientName: string | null = null;
  if (clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('name')
      .eq('id', clientId)
      .maybeSingle();
    clientName = client?.name ?? null;
  }

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      client_id: clientId || null,
      title: title.slice(0, 200),
      brief: brief.slice(0, 8000),
      deliverables,
      deadline: deadline || null,
      budget_amount: budget ? Math.round(parseFloat(budget) * 100) : null,
      currency,
      status: 'intake',
    })
    .select('id')
    .single();

  if (error || !project) {
    console.error('[projects] create failed', error?.message);
    return { error: 'Could not create the project. Try again.' };
  }

  // The AI pass refines; it never gates. Whatever it returns lands on the
  // project, and a failure leaves the raw brief intact with an honest note.
  let knowledge = '';
  try {
    knowledge = buildKnowledgeBlock(
      `${title} ${brief} ${deliverables.join(' ')}`,
      await getActivePlaybooks(),
    );
  } catch {
    // Knowledge is a bonus, never a gate.
  }
  const intake = await runIntake({
    title,
    brief,
    deliverables,
    deadline: deadline || null,
    budget: budget || null,
    currency,
    clientName,
    knowledge,
  });

  if (intake.restatement) {
    const { error: updateError } = await supabase
      .from('projects')
      .update({ brief_json: intake.restatement })
      .eq('id', project.id);
    if (updateError) console.error('[projects] restatement update failed', updateError.message);
  }

  if (intake.questions.length > 0) {
    const { error: questionsError } = await supabase.from('project_questions').insert(
      intake.questions.map((q) => ({
        user_id: user.id,
        project_id: project.id,
        question: q.question,
        why_it_matters: q.why_it_matters,
        status: 'open',
      })),
    );
    if (questionsError) console.error('[projects] questions insert failed', questionsError.message);
  }

  revalidatePath('/projects');
  redirect(`/projects/${project.id}`);
}

/**
 * Question lifecycle: open, sent, answered, dismissed. The answer text is
 * only taken with the answered status, and it feeds the planner later.
 */
export async function updateQuestionAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  if (!SUPABASE_CONFIGURED) return NOT_CONNECTED;

  const questionId = String(formData.get('question_id') ?? '');
  const intent = String(formData.get('intent') ?? '');
  const answer = String(formData.get('answer') ?? '').trim();

  if (!/^[0-9a-f-]{36}$/i.test(questionId)) return { error: 'Missing question.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session expired. Sign in again.' };

  const { data: question, error: findError } = await supabase
    .from('project_questions')
    .select('id, project_id')
    .eq('id', questionId)
    .maybeSingle();
  if (findError || !question) return { error: 'That question no longer exists.' };

  if (intent === 'sent') {
    const { error } = await supabase
      .from('project_questions')
      .update({ status: 'sent' })
      .eq('id', questionId);
    if (error) return { error: 'Could not mark that as sent.' };
  } else if (intent === 'answered') {
    if (answer.length < 2) return { error: 'Write the answer first, even one line.' };
    const { error } = await supabase
      .from('project_questions')
      .update({ status: 'answered', answer: answer.slice(0, 2000), answered_at: new Date().toISOString() })
      .eq('id', questionId);
    if (error) return { error: 'Could not save that answer.' };
  } else if (intent === 'dismissed') {
    const { error } = await supabase
      .from('project_questions')
      .update({ status: 'dismissed' })
      .eq('id', questionId);
    if (error) return { error: 'Could not dismiss that question.' };
  } else {
    return { error: 'Unknown action.' };
  }

  revalidatePath(`/projects/${question.project_id}`);
  return { error: null };
}

export type ProjectUpdateState = { error: string | null; text: string | null };

/**
 * Research the method before planning. One tap researches at most two
 * questions derived from the brief; notes attach to the project and the
 * planner cites them. Partial saves on purpose: whatever completed before a
 * slow network is kept, the page shows what landed.
 */
export async function researchProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  if (!SUPABASE_CONFIGURED) return NOT_CONNECTED;

  const projectId = String(formData.get('project_id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return { error: 'Missing project.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session expired. Sign in again.' };

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, title, brief, brief_json, deliverables')
    .eq('id', projectId)
    .maybeSingle();
  if (projectError || !project) return { error: 'That project no longer exists.' };

  const { count } = await supabase
    .from('research_notes')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if ((count ?? 0) >= 2) {
    return { error: 'This project already has its research. The plan is built from it.' };
  }

  const briefJson = (project.brief_json ?? {}) as { goal?: string | null };
  const { queries } = await generateResearchQueries({
    title: project.title,
    goal: briefJson.goal ?? null,
    deliverables: (project.deliverables ?? []) as string[],
    brief: project.brief,
  });
  if (queries.length === 0) {
    return { error: 'Could not work out what to research. Add more detail to the brief and try again.' };
  }

  const storedKey = await getStoredTavilyKey();
  const started = Date.now();
  let saved = 0;

  for (const query of queries) {
    if (Date.now() - started > 35000) break;
    const result = await researchQuestion(query, {
      tavilyKey: storedKey ?? undefined,
      synthTimeoutMs: 12000,
    });
    if (result.sources.length === 0) continue;

    const { error: insertError } = await supabase.from('research_notes').insert({
      user_id: user.id,
      project_id: projectId,
      query,
      sources: result.sources.map((s) => ({ url: s.url, title: s.title })),
      summary: result.answer ?? 'Search succeeded but the summary did not land. The sources below are worth a read.',
      findings: [],
      confidence: result.answer ? 0.8 : 0.5,
      freshness: 'fast',
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      tags: ['project'],
    });
    if (!insertError) saved += 1;
  }

  revalidatePath(`/projects/${projectId}`);
  if (saved === 0) {
    return { error: 'The search came back empty. Try again in a minute, or check the Tavily key in Settings.' };
  }
  redirect(`/projects/${projectId}`);
}

/**
 * Build the step plan from brief plus answers plus research. Refused without
 * research, because the acceptance test says so: method advice must be
 * researched first. Steps insert with their checklists all unchecked, and
 * nothing can be marked done until they pass.
 */
export async function planProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  if (!SUPABASE_CONFIGURED) return NOT_CONNECTED;

  const projectId = String(formData.get('project_id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return { error: 'Missing project.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session expired. Sign in again.' };

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select(
      'id, title, brief_json, deliverables, deadline, ' +
        'questions:project_questions(question, answer, status), ' +
        'steps:project_steps(id), ' +
        'notes:research_notes(query, summary, sources)',
    )
    .eq('id', projectId)
    .maybeSingle();
  if (projectError || !project) return { error: 'That project no longer exists.' };

  const row = project as unknown as {
    id: string;
    title: string;
    brief_json: Record<string, unknown> | null;
    deliverables: string[] | null;
    deadline: string | null;
    questions: { question: string; answer: string | null; status: string }[] | null;
    steps: { id: string }[] | null;
    notes: { query: string; summary: string; sources: { url?: string }[] }[] | null;
  };

  if ((row.steps ?? []).length > 0) {
    return { error: 'The plan already exists. Track it below instead of rebuilding it.' };
  }
  if ((row.notes ?? []).length === 0) {
    return { error: 'Research the method first. The plan is built from what it finds, not from guesses.' };
  }

  const briefJson = (row.brief_json ?? {}) as { goal?: string | null };
  const questions = row.questions ?? [];
  let knowledge = '';
  try {
    knowledge = buildKnowledgeBlock(
      `${row.title} ${briefJson.goal ?? ''} ${((row.deliverables ?? []) as string[]).join(' ')}`,
      await getActivePlaybooks(),
    );
  } catch {
    // Knowledge is a bonus, never a gate.
  }
  const plan = await runPlanner({
    title: row.title,
    goal: briefJson.goal ?? null,
    deliverables: (row.deliverables ?? []) as string[],
    deadline: row.deadline,
    answers: questions
      .filter((q) => q.status === 'answered' && q.answer)
      .map((q) => ({ question: q.question, answer: q.answer as string })),
    openQuestions: questions
      .filter((q) => q.status === 'open' || q.status === 'sent')
      .map((q) => q.question),
    research: (row.notes ?? []).map((note) => ({
      query: note.query,
      summary: note.summary,
      urls: (note.sources ?? [])
        .map((s) => s.url ?? '')
        .filter((u): u is string => u.startsWith('http'))
        .slice(0, 6),
    })),
    knowledge,
  });

  if (plan.steps.length === 0) {
    return { error: 'The planner could not finish. Try again in a minute.' };
  }

  const { error: stepsError } = await supabase.from('project_steps').insert(
    plan.steps.map((step, index) => ({
      user_id: user.id,
      project_id: projectId,
      position: index + 1,
      title: step.title,
      detail: step.detail,
      method: step.method,
      method_source: step.source_url,
      estimate_minutes: step.estimate_minutes,
      status: 'not_started',
      quality_checklist: step.checklist.map((item) => ({ item, done: false })),
    })),
  );
  if (stepsError) {
    console.error('[projects] steps insert failed', stepsError.message);
    return { error: 'Could not save the plan. Try again.' };
  }

  const { error: statusError } = await supabase
    .from('projects')
    .update({
      status: 'planned',
      brief_json: { ...briefJson, planning_assumptions: plan.assumptions },
    })
    .eq('id', projectId);
  if (statusError) console.error('[projects] status update failed', statusError.message);

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

const STEP_TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  start: { from: ['not_started'], to: 'in_progress' },
  review: { from: ['in_progress'], to: 'review' },
  unblock: { from: ['blocked'], to: 'in_progress' },
};

/**
 * Step tracking with one hard rule: done requires every checklist item
 * passed. Blocked requires a named blocker. The project status follows the
 * steps, so the dashboard never lies.
 */
export async function updateStepAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  if (!SUPABASE_CONFIGURED) return NOT_CONNECTED;

  const stepId = String(formData.get('step_id') ?? '');
  const intent = String(formData.get('intent') ?? '');
  const blockedReason = String(formData.get('blocked_reason') ?? '').trim();
  const checkIndex = Number(formData.get('check_index') ?? -1);

  if (!/^[0-9a-f-]{36}$/i.test(stepId)) return { error: 'Missing step.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session expired. Sign in again.' };

  const { data: step, error: stepError } = await supabase
    .from('project_steps')
    .select('id, project_id, status, quality_checklist')
    .eq('id', stepId)
    .maybeSingle();
  if (stepError || !step) return { error: 'That step no longer exists.' };

  const checklist = normaliseChecklist(step.quality_checklist);
  const status = String(step.status);

  if (intent === 'toggle') {
    if (status === 'done') return { error: 'That step is done. Its checklist is locked.' };
    if (!Number.isInteger(checkIndex) || checkIndex < 0 || checkIndex >= checklist.length) {
      return { error: 'Unknown checklist item.' };
    }
    const item = checklist[checkIndex];
    if (!item) return { error: 'Unknown checklist item.' };
    checklist[checkIndex] = { item: item.item, done: !item.done };
    const { error } = await supabase
      .from('project_steps')
      .update({ quality_checklist: checklist })
      .eq('id', stepId);
    if (error) return { error: 'Could not update the checklist.' };
    revalidatePath(`/projects/${step.project_id}`);
    return { error: null };
  }

  if (intent === 'block') {
    if (!['not_started', 'in_progress', 'review'].includes(status)) {
      return { error: 'Only an open step can be blocked.' };
    }
    if (blockedReason.length < 5) {
      return { error: 'Name what is blocking it. A blocked step without a reason helps no one.' };
    }
    const { error } = await supabase
      .from('project_steps')
      .update({ status: 'blocked', blocked_reason: blockedReason.slice(0, 500) })
      .eq('id', stepId);
    if (error) return { error: 'Could not block that step.' };
  } else if (intent === 'done') {
    if (!['in_progress', 'review'].includes(status)) {
      return { error: 'Work the step first: start it, then mark it done.' };
    }
    const unchecked = checklist.filter((item) => !item.done);
    if (unchecked.length > 0) {
      return {
        error: `Not done yet: ${unchecked.length} checklist ${unchecked.length === 1 ? 'item' : 'items'} still unchecked. Nothing ships unverified.`,
      };
    }
    const { error } = await supabase.from('project_steps').update({ status: 'done' }).eq('id', stepId);
    if (error) return { error: 'Could not mark that step done.' };
  } else {
    const transition = STEP_TRANSITIONS[intent];
    if (!transition) return { error: 'Unknown action.' };
    if (!transition.from.includes(status)) {
      return { error: 'That move does not make sense from the current status.' };
    }
    const update: Record<string, unknown> = { status: transition.to };
    if (transition.to === 'in_progress') update.blocked_reason = null;
    const { error } = await supabase.from('project_steps').update(update).eq('id', stepId);
    if (error) return { error: 'Could not update that step.' };
  }

  // The project status follows the steps: active once work starts, delivered
  // once every step passes. The dashboard reads it, so it must be true.
  const { data: allSteps } = await supabase
    .from('project_steps')
    .select('status')
    .eq('project_id', step.project_id);
  const statuses = (allSteps ?? []).map((s) => String(s.status));
  const nextStatus =
    statuses.length > 0 && statuses.every((s) => s === 'done')
      ? 'delivered'
      : statuses.some((s) => ['in_progress', 'review', 'blocked'].includes(s))
        ? 'active'
        : 'planned';
  await supabase.from('projects').update({ status: nextStatus }).eq('id', step.project_id);

  revalidatePath(`/projects/${step.project_id}`);
  revalidatePath('/projects');
  revalidatePath('/');
  return { error: null };
}

/**
 * The client update draft. Reads the tracker, never invents. Returns the
 * text in state so the panel can show it editable and copyable.
 */
export async function draftProjectUpdateAction(
  _prev: ProjectUpdateState,
  formData: FormData,
): Promise<ProjectUpdateState> {
  if (!SUPABASE_CONFIGURED) return { error: NOT_CONNECTED.error, text: null };

  const projectId = String(formData.get('project_id') ?? '');
  const extra = String(formData.get('extra') ?? '').trim() || null;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return { error: 'Missing project.', text: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session expired. Sign in again.', text: null };

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, title, deadline, clients(name), steps:project_steps(title, status, blocked_reason)')
    .eq('id', projectId)
    .maybeSingle();
  if (projectError || !project) return { error: 'That project no longer exists.', text: null };

  const row = project as unknown as {
    title: string;
    deadline: string | null;
    clients: { name: string } | null;
    steps: { title: string; status: string; blocked_reason: string | null }[] | null;
  };

  const result = await draftProjectUpdate({
    clientName: row.clients?.name ?? null,
    title: row.title,
    steps: (row.steps ?? []).map((s) => ({
      title: s.title,
      status: s.status,
      blocked_reason: s.blocked_reason,
    })),
    deadline: row.deadline,
    extra,
  });

  if (!result.text) {
    return { error: 'The draft did not land. Try again in a minute.', text: null };
  }
  return { error: null, text: result.text };
}
