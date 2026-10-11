import type { ChatCaptureResult } from './capture';

export type ChatState = ChatCaptureResult & { path?: string };

export const EMPTY_CHAT_STATE: ChatState = { ok: false };
