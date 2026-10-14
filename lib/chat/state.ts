import type { ChatCaptureResult } from './capture';

export type ChatState = ChatCaptureResult;

export const EMPTY_CHAT_STATE: ChatState = { ok: false };
