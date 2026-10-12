'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { runIntake } from '@/lib/ai/intake';
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
  const intake = await runIntake({
    title,
    brief,
    deliverables,
    deadline: deadline || null,
    budget: budget || null,
    currency,
    clientName,
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
