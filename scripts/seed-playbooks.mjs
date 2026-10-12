/**
 * Seeds the nine playbooks from docs/playbooks into the playbooks table.
 * Inserts only: existing rows (and the owner's edits) are never touched.
 *
 *   node --env-file=.env.local scripts/seed-playbooks.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SECRET_KEY;
// The app is single user; the owner id is the fallback so the seed runs with
// nothing but .env.local.
const OWNER = process.env.OWNER_USER_ID ?? 'dd7d649d-b19a-4897-b4eb-e7c8d5f6d6bd';

const PLAYBOOKS = [
  {
    slug: 'web-development',
    title: 'Web design and development',
    file: 'web-development.md',
    has_time_sensitive: true,
    trigger_keywords: [
      'website', 'wordpress', 'shopify', 'store', 'landing', 'homepage', 'theme',
      'woocommerce', 'hosting', 'domain', 'checkout', 'redesign', 'web', 'site',
    ],
  },
  {
    slug: 'graphic-design',
    title: 'Graphic design',
    file: 'graphic-design.md',
    has_time_sensitive: false,
    trigger_keywords: [
      'logo', 'brand', 'palette', 'font', 'poster', 'banner', 'flyer', 'design file',
      'vector', 'revision',
    ],
  },
  {
    slug: 'meta-ads',
    title: 'Meta ads',
    file: 'meta-ads.md',
    has_time_sensitive: true,
    trigger_keywords: [
      'facebook', 'meta', 'ad campaign', 'ads', 'cpm', 'pixel', 'conversions api',
      'ad set', 'creative', 'audience', 'instagram ad',
    ],
  },
  {
    slug: 'google-ads',
    title: 'Google ads',
    file: 'google-ads.md',
    has_time_sensitive: true,
    trigger_keywords: [
      'google ads', 'search ads', 'keyword', 'cpc', 'quality score', 'negative keyword',
      'search terms',
    ],
  },
  {
    slug: 'marketing-strategy',
    title: 'Digital marketing strategy',
    file: 'marketing-strategy.md',
    has_time_sensitive: false,
    trigger_keywords: [
      'marketing', 'strategy', 'followers', 'channel', 'funnel', 'positioning',
      'growth', 'organic',
    ],
  },
  {
    slug: 'ecommerce',
    title: 'Ecommerce and dropshipping',
    file: 'ecommerce.md',
    has_time_sensitive: true,
    trigger_keywords: [
      'dropshipping', 'supplier', 'product', 'shipping', 'returns', 'bundle',
      'cart', 'conversion rate', 'aov',
    ],
  },
  {
    slug: 'email-marketing',
    title: 'Email marketing',
    file: 'email-marketing.md',
    has_time_sensitive: true,
    trigger_keywords: [
      'email', 'newsletter', 'list', 'deliverability', 'subject line', 'flow',
      'unsubscribe', 'klaviyo',
    ],
  },
  {
    slug: 'fiverr-client-management',
    title: 'Fiverr and client management',
    file: 'fiverr-client-management.md',
    has_time_sensitive: true,
    trigger_keywords: [
      'fiverr', 'gig', 'buyer', 'order', 'review', 'revision', 'delivery',
    ],
  },
  {
    slug: 'sales-closing',
    title: 'Sales psychology and closing',
    file: 'sales-closing.md',
    has_time_sensitive: false,
    trigger_keywords: [
      'price', 'quote', 'discount', 'expensive', 'deposit', 'objection', 'follow up',
      'negotiat', 'closing', 'payment', 'budget',
    ],
  },
];

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

let inserted = 0;
let skipped = 0;
for (const playbook of PLAYBOOKS) {
  const check = await fetch(`${URL}/rest/v1/playbooks?slug=eq.${playbook.slug}&select=id`, {
    headers,
  });
  const existing = await check.json();
  if (Array.isArray(existing) && existing.length > 0) {
    skipped += 1;
    console.log(`skip  ${playbook.slug}`);
    continue;
  }

  const content = fs.readFileSync(
    path.join(process.cwd(), 'docs', 'playbooks', playbook.file),
    'utf8',
  );
  const insert = await fetch(`${URL}/rest/v1/playbooks`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      user_id: OWNER,
      slug: playbook.slug,
      title: playbook.title,
      content,
      trigger_keywords: playbook.trigger_keywords,
      has_time_sensitive: playbook.has_time_sensitive,
      active: true,
    }),
  });
  if (!insert.ok) {
    console.error(`FAIL ${playbook.slug}: ${insert.status} ${await insert.text()}`);
    process.exit(1);
  }
  inserted += 1;
  console.log(`seed  ${playbook.slug}`);
}
console.log(`done: ${inserted} inserted, ${skipped} already present`);
