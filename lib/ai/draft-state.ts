/** Shared state shapes for the reply panel. Kept out of the "use server" file
 * so both the client component and ordinary server modules can import them. */

export type DraftState = {
  error: string | null;
  draft: string | null;
  /** Why the second attempt was needed, or what is still wrong with it. */
  problems: string[];
  ok: boolean;
  fixed: boolean;
  attempts: number;
  latencyMs: number;
  /** Which model actually wrote the draft, after any quota fallback. */
  modelId: string | null;
  /** Echoed back so the panel can show what was being replied to. */
  incoming: string;
  channel: string;
};

export const EMPTY_DRAFT_STATE: DraftState = {
  error: null,
  draft: null,
  problems: [],
  ok: false,
  fixed: false,
  attempts: 0,
  latencyMs: 0,
  modelId: null,
  incoming: '',
  channel: 'instagram',
};

export type SaveSentState = { error: string | null; saved: boolean };
