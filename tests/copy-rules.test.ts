/**
 * House rules for everything the user can read: no em dashes, no en dashes, and
 * no tired filler phrases. These are easy to break by accident when copying text
 * around, so they are checked mechanically instead of trusted to memory.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * Deliberately not scanned: scripts/. Two reasons.
 *
 * 1. scripts/import-instagram-*.sql embeds real historical messages, copied
 *    exact. A dash a person actually typed in 2026 is a record, not a style
 *    choice, and rewriting it would falsify the archive.
 * 2. The importer checks its own authored SQL for dashes instead, at build time,
 *    where a failure points at the text that can actually be fixed.
 *
 * Anything the application renders or serves to the user lives in the
 * directories below and is fully covered.
 */
const SCANNED_DIRECTORIES = ['app', 'components', 'lib', 'docs', 'supabase'];

/**
 * The guardrail keeps the banned phrases as its blocklist, so it is the one file
 * that must contain them. Reading them out is checked behaviourally instead.
 */
const BLOCKLIST_FILE = 'lib/ai/style-guard.ts';
const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.css', '.sql', '.md'];

const EM_DASH = '\u2014';
const EN_DASH = '\u2013';

/** Phrases that make a message sound like a template rather than a person. */
const BANNED_PHRASES = [
  'i hope this email finds you well',
  'i hope this finds you well',
  'thank you for reaching out',
  'thanks for reaching out',
  'as an ai language model',
  'as an ai,',
  'circle back',
  'touch base',
  'synergy',
];

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFiles(full, out);
      continue;
    }
    if (SCANNED_EXTENSIONS.some((extension) => full.endsWith(extension))) out.push(full);
  }
  return out;
}

const files = SCANNED_DIRECTORIES.flatMap((dir) => collectFiles(dir));

test('there are files to scan, so this test cannot pass by finding nothing', () => {
  assert.ok(files.length > 20, `expected to scan the app, found only ${files.length} files`);
});

test('no em dashes or en dashes anywhere the user can read them', () => {
  const offenders: string[] = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    content.split('\n').forEach((line, index) => {
      if (line.includes(EM_DASH) || line.includes(EN_DASH)) {
        offenders.push(`${file}:${index + 1}`);
      }
    });
  }

  assert.deepEqual(offenders, [], `dashes found in:\n${offenders.join('\n')}`);
});

test('no filler openings or corporate padding', () => {
  const offenders: string[] = [];

  for (const file of files) {
    if (file.endsWith('.css')) continue;
    if (file.endsWith(BLOCKLIST_FILE)) continue;
    // Documentation quotes bad examples in order to forbid them. The interface
    // and the code must never contain them.
    if (file.startsWith('docs/')) continue;
    const lowered = readFileSync(file, 'utf8').toLowerCase();
    for (const phrase of BANNED_PHRASES) {
      if (lowered.includes(phrase)) offenders.push(`${file}: "${phrase}"`);
    }
  }

  assert.deepEqual(offenders, [], `banned phrases found:\n${offenders.join('\n')}`);
});

test('the em dash rule is enforced in code, not just promised', async () => {
  // Behaviour, not text matching: a draft full of dashes and filler goes in,
  // and clean text comes out.
  const { enforceStyleWithTelemetry } = await import('../lib/ai/style-guard.ts');

  const draft = `Thanks for reaching out ${EM_DASH} I reviewed the site and the checkout breaks on mobile.`;
  const result = enforceStyleWithTelemetry(draft, { channel: 'fiverr' });

  assert.ok(!result.text.includes(EM_DASH), 'no em dash survives the guardrail');
  assert.ok(!result.text.includes(EN_DASH), 'no en dash survives the guardrail');
  assert.ok(!/thanks for reaching out/i.test(result.text), 'the filler opening is gone');
  assert.ok(result.actions.dashesReplaced >= 1, 'the interception is counted for telemetry');
});
