import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const shell = readFileSync(new URL('../components/app-shell.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const rootLayout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');

test('navigation adapts from a mobile bar to a full workspace sidebar', () => {
  assert.match(shell, /<aside className="[^"]*hidden[^"]*lg:flex/);
  assert.match(shell, /mobile-bottom-nav lg:hidden/);
  assert.match(shell, /href: '\/research'/);
  assert.match(shell, /href: '\/knowledge'/);
  assert.match(shell, /aria-expanded=\{moreOpen\}/);
});

test('mobile layout reserves space for the bottom navigation and device safe areas', () => {
  assert.match(shell, /pb-\[calc\(76px\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(styles, /\.mobile-header\s*\{[^}]*padding-top:\s*env\(safe-area-inset-top\)/s);
  assert.match(styles, /\.mobile-bottom-nav\s*\{[^}]*padding-bottom:\s*env\(safe-area-inset-bottom\)/s);
  assert.match(rootLayout, /viewportFit:\s*'cover'/);
});

test('form controls and navigation remain usable on narrow touch screens', () => {
  assert.match(styles, /\.field\s*\{[^}]*min-height:\s*48px;[^}]*font-size:\s*16px;/s);
  assert.match(styles, /\.btn\s*\{[^}]*min-height:\s*48px;/s);
  assert.match(styles, /\.btn-small\s*\{[^}]*min-height:\s*40px;/s);
  assert.match(styles, /@media \(max-width:\s*640px\)[\s\S]*?\.btn-small\s*\{\s*min-height:\s*44px;/);
  assert.match(styles, /\.mobile-nav-link\s*\{[^}]*min-height:\s*64px;[^}]*flex-direction:\s*column;/s);
});
