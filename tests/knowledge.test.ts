import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildKnowledgeBlock,
  freshnessState,
  parseRefreshQueries,
  selectPlaybooks,
  stripVerifiedSections,
  type PlaybookLike,
} from '../lib/ai/knowledge.ts';

const NOW = Date.parse('2026-10-12T12:00:00Z');

function playbook(overrides: Partial<PlaybookLike> = {}): PlaybookLike {
  return {
    slug: 'meta-ads',
    title: 'Meta ads',
    content: '# Meta ads\n\n## Diagnosis tree: no sales\n- Check the pixel first.',
    trigger_keywords: ['ads', 'pixel', 'cpm'],
    has_time_sensitive: true,
    last_researched_at: new Date(NOW - 3 * 24 * 3600 * 1000).toISOString(),
    ...overrides,
  };
}

test('selectPlaybooks scores keywords and caps at two', () => {
  const rows = [
    playbook(),
    playbook({ slug: 'sales-closing', title: 'Sales', trigger_keywords: ['price', 'deposit'], content: '# Sales', last_researched_at: null, has_time_sensitive: false }),
    playbook({ slug: 'email-marketing', title: 'Email', trigger_keywords: ['email'], content: '# Email', last_researched_at: null, has_time_sensitive: false }),
  ];
  const picked = selectPlaybooks('the ads cpm jumped and the pixel looks off', rows);
  assert.deepEqual(picked.map((row) => row.slug), ['meta-ads']);
  const two = selectPlaybooks('price for ads with email follow up', rows);
  assert.equal(two.length, 2, 'at most two playbooks ride along');
});

test('freshness follows the design doc windows', () => {
  const fresh = freshnessState(playbook(), NOW);
  assert.deepEqual(fresh, { windowDays: 14, stale: false });

  const stale = freshnessState(
    playbook({ last_researched_at: new Date(NOW - 20 * 24 * 3600 * 1000).toISOString() }),
    NOW,
  );
  assert.equal(stale.stale, true);

  const fundamentals = freshnessState(
    playbook({ slug: 'sales-closing', has_time_sensitive: false, last_researched_at: null }),
    NOW,
  );
  assert.equal(fundamentals.stale, false, 'fundamentals never rot');
});

test('parseRefreshQueries reads the refresh section only', () => {
  const content = [
    '# Web development',
    '- a checklist line',
    '## Discovery',
    '- [ ] another line',
    '## Research refresh',
    '- Shopify plan pricing this year',
    '- Core Web Vitals thresholds',
    '- a third question that gets cut',
  ].join('\n');
  assert.deepEqual(parseRefreshQueries(content), [
    'Shopify plan pricing this year',
    'Core Web Vitals thresholds',
  ]);
});

test('stripVerifiedSections keeps only the body', () => {
  const content = [
    '# Meta ads',
    '',
    '## Verified 1 Oct 2026',
    '- old note',
    '  sources: https://old.example',
    '',
    '## Diagnosis tree: no sales',
    '- Check the pixel first.',
  ].join('\n');
  const stripped = stripVerifiedSections(content);
  assert.equal(stripped.includes('old note'), false);
  assert.equal(stripped.includes('Check the pixel first.'), true);
});

test('buildKnowledgeBlock warns when the playbook is stale', () => {
  const staleRow = playbook({
    last_researched_at: new Date(NOW - 30 * 24 * 3600 * 1000).toISOString(),
  });
  const block = buildKnowledgeBlock('our ads cpm doubled', [staleRow], NOW);
  assert.equal(block.includes('### Playbook: Meta ads'), true);
  assert.equal(block.includes('verify current figures with research'), true);

  const freshBlock = buildKnowledgeBlock('our ads cpm doubled', [playbook()], NOW);
  assert.equal(freshBlock.includes('verify current figures'), false);
  assert.equal(buildKnowledgeBlock('the logo needs a second concept', [playbook()]), '');
});
