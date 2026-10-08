'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SUPABASE_CONFIGURED } from '@/lib/env';
import { validateMessageForm } from '@/lib/validation/client';

export type ThreadFormState = { error: string | null };

type AttachmentInput = {
  path: string;
  name: string;
  size: number;
  kind: string;
};

const NOT_CONNECTED = {
  error: 'Supabase is not connected, so nothing can be saved yet.',
} as const;

export async function createThreadAction(
  _prev: ThreadFormState,
  formData: FormData,
): Promise<ThreadFormState> {
  if (!SUPABASE_CONFIGURED) return NOT_CONNECTED;

  const clientId = String(formData.get('client_id') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const mode = String(formData.get('mode') ?? 'client_reply');

  if (!clientId) return { error: 'That thread needs a client.' };
  if (title.length < 2) return { error: 'Give the thread a short title. It is how you will find it later.' };

  const allowedModes = ['client_reply', 'project', 'internal'];
  if (!allowedModes.includes(mode)) return { error: 'Unknown thread type.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session expired. Sign in again.' };

  const { data, error } = await supabase
    .from('threads')
    .insert({ user_id: user.id, client_id: clientId, title, mode })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[threads] create failed', error?.message);
    return { error: 'Could not start that thread.' };
  }

  revalidatePath(`/clients/${clientId}`);
  redirect(`/threads/${data.id}`);
}

/**
 * Saves one message and any screenshots that were uploaded with it.
 * Files are uploaded straight from the browser into private storage, so a large
 * screenshot never has to pass through a server action. Only the paths arrive
 * here, and the storage rules already proved they belong to this user.
 */
export async function postMessageAction(
  _prev: ThreadFormState,
  formData: FormData,
): Promise<ThreadFormState> {
  if (!SUPABASE_CONFIGURED) return NOT_CONNECTED;

  const threadId = String(formData.get('thread_id') ?? '');
  if (!threadId) return { error: 'Missing thread.' };

  const parsed = validateMessageForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  let attachments: AttachmentInput[] = [];
  const rawAttachments = formData.get('attachments');
  if (typeof rawAttachments === 'string' && rawAttachments.trim() !== '') {
    try {
      const maybe = JSON.parse(rawAttachments);
      if (Array.isArray(maybe)) {
        attachments = maybe
          .filter(
            (a): a is AttachmentInput =>
              typeof a?.path === 'string' &&
              typeof a?.name === 'string' &&
              typeof a?.size === 'number',
          )
          .slice(0, 10)
          .map((a) => ({
            path: a.path,
            name: a.name.slice(0, 200),
            size: a.size,
            kind: ['image', 'pdf', 'text', 'other'].includes(a.kind) ? a.kind : 'other',
          }));
      }
    } catch {
      return { error: 'Something went wrong reading the attachments. Try again without them.' };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session expired. Sign in again.' };

  const { data: thread, error: threadError } = await supabase
    .from('threads')
    .select('id, client_id')
    .eq('id', threadId)
    .maybeSingle();

  if (threadError || !thread) return { error: 'That thread no longer exists.' };

  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      user_id: user.id,
      thread_id: threadId,
      role: parsed.values.role,
      content: parsed.values.content,
      channel: parsed.values.channel,
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !message) {
    console.error('[messages] insert failed', error?.message);
    return { error: 'Could not save that message.' };
  }

  if (attachments.length > 0) {
    const { error: attachError } = await supabase.from('attachments').insert(
      attachments.map((a) => ({
        user_id: user.id,
        message_id: message.id,
        client_id: thread.client_id,
        storage_path: a.path,
        original_name: a.name,
        size_bytes: a.size,
        kind: a.kind,
      })),
    );

    if (attachError) {
      // The message is saved. Losing the attachment record is worth telling you
      // about, but it must not fail silently or lose what you typed.
      console.error('[messages] attachment insert failed', attachError.message);
      revalidatePath(`/threads/${threadId}`);
      return { error: 'Message saved, but the attachment record failed. The file is still in storage.' };
    }
  }

  revalidatePath(`/threads/${threadId}`);
  if (thread.client_id) revalidatePath(`/clients/${thread.client_id}`);
  revalidatePath('/');
  return { error: null };
}
