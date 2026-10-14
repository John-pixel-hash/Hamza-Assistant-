import { dedupeKey } from './threads';

export const MAX_CHAT_SCREENSHOTS = 10;
export const MAX_CHAT_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_CHAT_BATCH_BYTES = 12 * 1024 * 1024;

export type ChatScreenshotUpload = { path: string; name: string };
export type SourcedChatMessage = {
  role: 'client' | 'me';
  text: string;
  /** Zero-based positions in the ordered screenshot batch. */
  screenshotIndices: number[];
};

export type ScreenshotUploadParseResult = {
  uploads: ChatScreenshotUpload[];
  error: string | null;
};

export function moveScreenshotAt<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  const moved = [...items];
  if (index < 0 || index >= moved.length || target < 0 || target >= moved.length) return moved;
  [moved[index], moved[target]] = [moved[target]!, moved[index]!];
  return moved;
}

/** Validates the client-supplied list before the server reads from storage. */
export function parseChatScreenshotUploads(raw: unknown): ScreenshotUploadParseResult {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { uploads: [], error: 'The screenshot list is invalid. Select them again.' };
    }
  }

  if (!Array.isArray(value) || value.length === 0) {
    return { uploads: [], error: 'Select at least one screenshot first.' };
  }
  if (value.length > MAX_CHAT_SCREENSHOTS) {
    return {
      uploads: [],
      error: `Choose no more than ${MAX_CHAT_SCREENSHOTS} screenshots at once.`,
    };
  }

  const uploads: ChatScreenshotUpload[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      return { uploads: [], error: 'The screenshot list is invalid. Select them again.' };
    }
    const row = entry as Record<string, unknown>;
    const path = typeof row.path === 'string' ? row.path.trim() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!path || path.length > 512 || !name || name.length > 180) {
      return { uploads: [], error: 'The screenshot list is invalid. Select them again.' };
    }
    if (seen.has(path)) continue;
    seen.add(path);
    uploads.push({ path, name });
  }

  if (uploads.length === 0) {
    return { uploads: [], error: 'Select at least one screenshot first.' };
  }
  return { uploads, error: null };
}

/**
 * Merges matching bubbles reported in adjacent screenshots, while retaining
 * each source image. Repeated text visible in the same screenshot stays intact.
 */
export function mergeOverlappingMessages(messages: SourcedChatMessage[]): SourcedChatMessage[] {
  const merged: SourcedChatMessage[] = [];
  const positions = new Map<string, number[]>();

  for (const message of messages) {
    const text = message.text.trim();
    if (!text) continue;
    const key = dedupeKey(message.role, text);
    const candidates = positions.get(key) ?? [];
    const messageSources = [...new Set(message.screenshotIndices)];
    let existingIndex: number | undefined;

    for (const position of candidates) {
      const existing = merged[position];
      if (!existing) continue;
      const sameScreenshot = existing.screenshotIndices.some((index) => messageSources.includes(index));
      const adjacentScreenshots = existing.screenshotIndices.some((existingIndex) =>
        messageSources.some((messageIndex) => Math.abs(existingIndex - messageIndex) === 1),
      );
      if (!sameScreenshot && adjacentScreenshots) {
        existingIndex = position;
        break;
      }
    }

    if (existingIndex === undefined) {
      positions.set(key, [...candidates, merged.length]);
      merged.push({
        role: message.role,
        text,
        screenshotIndices: messageSources.sort((a, b) => a - b),
      });
      continue;
    }

    const existing = merged[existingIndex];
    if (!existing) continue;
    existing.screenshotIndices = [...new Set([
      ...existing.screenshotIndices,
      ...messageSources,
    ])].sort((a, b) => a - b);
  }

  return merged;
}
