import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { buildAssistantDraftRow, saveAssistantDraft, type AssistantDraftInput } from '../lib/chat/assistant-draft.ts';

function input(overrides: Partial<AssistantDraftInput> = {}): AssistantDraftInput {
  return {
    userId: 'user-1',
    threadId: 'thread-1',
    content: '  I can confirm the revised price today. Does that work for you?  ',
    channel: 'fiverr',
    source: 'thread_reply',
    createdAt: '2026-10-14T10:00:00.000Z',
    outcome: {
      ok: true,
      text: 'I can confirm the revised price today. Does that work for you?',
      fixed: false,
      attempts: 1,
      actions: {
        dashesReplaced: 0,
        fillerRemoved: 0,
        words: 12,
        lengthOk: true,
        overBudgetBy: 0,
        chasePhrases: [],
        bannedOpeners: [],
        questions: 1,
        overQuestioned: false,
        missingClosingQuestion: false,
        sentenceCount: 2,
        tooManySentences: false,
        stiffPhrases: [],
        hasListMarkers: false,
      },
      problems: [],
      latencyMs: 1200,
      usage: { inputTokens: 90, outputTokens: 18 },
      modelId: 'gemini-3.5-flash',
    },
    ...overrides,
  };
}

test('generated replies are stored as unsent assistant drafts with provenance', () => {
  const row = buildAssistantDraftRow(input({ channel: 'tiktok' }));
  const meta = row.meta as { kind: string; source: string; sent: boolean };

  assert.equal(row.role, 'assistant');
  assert.equal(row.content, 'I can confirm the revised price today. Does that work for you?');
  assert.equal(row.channel, 'tiktok', 'the TikTok channel is recorded for future context');
  assert.equal(row.sent_at, '2026-10-14T10:00:00.000Z');
  assert.equal(row.model_id, 'gemini-3.5-flash');
  assert.equal(row.latency_ms, 1200);
  assert.equal(row.input_tokens, 90);
  assert.equal(row.output_tokens, 18);
  assert.deepEqual(meta, { kind: 'assistant_draft', source: 'thread_reply', sent: false });
});

test('the save helper inserts one assistant row and returns its id', async () => {
  const state: { inserted?: Record<string, unknown> } = {};
  const fakeClient = {
    from(table: string) {
      assert.equal(table, 'messages');
      return {
        insert(row: Record<string, unknown>) {
          state.inserted = row;
          return {
            select(_columns: string) {
              return { single: async () => ({ data: { id: 'saved-draft-1' }, error: null }) };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  const result = await saveAssistantDraft(fakeClient, input());
  assert.deepEqual(result, { id: 'saved-draft-1', error: null });
  assert.ok(state.inserted);
  assert.equal(state.inserted.role, 'assistant');
  assert.equal(state.inserted.thread_id, 'thread-1');
});

test('empty, oversized, and failed database saves are reported without false success', async () => {
  let insertCalls = 0;
  const unavailableClient = {
    from() {
      insertCalls += 1;
      throw new Error('insert should not run for invalid drafts');
    },
  } as unknown as SupabaseClient;

  const empty = await saveAssistantDraft(unavailableClient, input({ content: '   ' }));
  const oversized = await saveAssistantDraft(unavailableClient, input({ content: 'x'.repeat(6001) }));
  assert.deepEqual(empty, { id: null, error: 'The draft was empty.' });
  assert.deepEqual(oversized, { id: null, error: 'The draft is too long to save.' });
  assert.equal(insertCalls, 0);

  const failedClient = {
    from() {
      return {
        insert() {
          return {
            select() {
              return { single: async () => ({ data: null, error: { message: 'database unavailable' } }) };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  const failed = await saveAssistantDraft(failedClient, input());
  assert.deepEqual(failed, { id: null, error: 'database unavailable' });
});
