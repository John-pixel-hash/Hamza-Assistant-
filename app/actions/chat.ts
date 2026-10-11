'use server';

import { captureChatScreenshot, type ChatCaptureResult } from '@/lib/chat/capture';
import { revalidatePath } from 'next/cache';

export type ChatState = ChatCaptureResult & { path?: string };

export const EMPTY_CHAT_STATE: ChatState = { ok: false };

/**
 * The whole Chat flow behind one form post: the browser has already uploaded
 * the screenshot to private storage, so only the path travels here.
 */
export async function chatCaptureAction(_prev: ChatState, formData: FormData): Promise<ChatState> {
  const path = String(formData.get('storage_path') ?? '').trim();
  const originalName = String(formData.get('original_name') ?? 'screenshot').trim() || 'screenshot';
  const override = String(formData.get('client_name') ?? '').trim() || null;

  if (!path) return { ok: false, error: 'Upload a screenshot first.' };

  const result = await captureChatScreenshot(path, originalName, override);
  if (result.ok) {
    revalidatePath('/');
    revalidatePath('/clients');
  }
  return { ...result, path };
}
