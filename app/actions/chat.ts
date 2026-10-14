'use server';

import { revalidatePath } from 'next/cache';
import { captureChatScreenshots } from '@/lib/chat/capture';
import { parseChatScreenshotUploads } from '@/lib/chat/capture-core';
import type { ChatState } from '@/lib/chat/state';

/**
 * The whole Chat flow behind one form post. The browser uploads the images to
 * private storage, then sends their ordered paths and original names here.
 */
export async function chatCaptureAction(_prev: ChatState, formData: FormData): Promise<ChatState> {
  const parsed = parseChatScreenshotUploads(formData.get('screenshots'));
  const override = String(formData.get('client_name') ?? '').trim() || null;
  if (parsed.error) return { ok: false, error: parsed.error };

  const result = await captureChatScreenshots(parsed.uploads, override);
  if (result.ok) {
    revalidatePath('/');
    revalidatePath('/clients');
  }
  return { ...result, uploads: result.uploads ?? parsed.uploads };
}
