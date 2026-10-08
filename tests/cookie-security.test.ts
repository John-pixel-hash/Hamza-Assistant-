/**
 * Session cookie hardening tests.
 *
 * These cover the two things the Supabase libraries leave to the application:
 * the Secure attribute, and the cache headers that must accompany a response
 * carrying a session cookie. Both only bite in production, behind a real domain
 * and a CDN, which is exactly why they are tested rather than eyeballed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PRIVATE_CACHE_HEADERS,
  applyPrivateCacheHeaders,
  shouldSecureCookies,
} from '../lib/auth/cookie-security.ts';

// ------------------------------------------------------------- secure -----

test('HTTPS from any hop marks the cookie Secure', () => {
  assert.equal(shouldSecureCookies({ forwardedProto: 'https' }), true);
  assert.equal(shouldSecureCookies({ forwardedProto: 'HTTPS' }), true);
  assert.equal(shouldSecureCookies({ forwardedProto: ' https ' }), true);
  assert.equal(shouldSecureCookies({ protocol: 'https:' }), true);
  // Vercel and most hosts append, so the header can list several hops.
  assert.equal(shouldSecureCookies({ forwardedProto: 'https, https' }), true);
});

test('plain HTTP does not, so local development keeps working', () => {
  assert.equal(shouldSecureCookies({ forwardedProto: 'http' }), false);
  assert.equal(shouldSecureCookies({ protocol: 'http:' }), false);
  // The local dev case: no forwarding header at all.
  assert.equal(shouldSecureCookies({}), false);
  assert.equal(shouldSecureCookies({ forwardedProto: null, protocol: 'http:' }), false);
});

test('a chain reporting both is treated as HTTPS', () => {
  // Fail safe. If any hop says https the visitor is on an encrypted connection
  // somewhere, and a client cannot talk the app out of hardening by claiming it
  // arrived over http.
  assert.equal(shouldSecureCookies({ forwardedProto: 'http, https' }), true);
  assert.equal(shouldSecureCookies({ forwardedProto: 'https, http' }), true);
  assert.equal(shouldSecureCookies({ forwardedProto: 'http, http', protocol: 'https:' }), true);
});

test('junk in the header does not throw or force Secure on', () => {
  assert.equal(shouldSecureCookies({ forwardedProto: '' }), false);
  assert.equal(shouldSecureCookies({ forwardedProto: '   ' }), false);
  assert.equal(shouldSecureCookies({ forwardedProto: 'ws' }), false);
  assert.equal(shouldSecureCookies({ forwardedProto: ',,,' }), false);
  assert.equal(shouldSecureCookies({ protocol: 'ftp:' }), false);
});

// -------------------------------------------------------------- cache -----

test('private cache headers stop a CDN storing a session', () => {
  const headers = applyPrivateCacheHeaders(new Headers());

  // A response that sets an auth cookie must never be cached anywhere between
  // the server and the browser, or one visitor can be served another's session.
  const cacheControl = headers.get('cache-control') ?? '';
  assert.match(cacheControl, /no-store/);
  assert.match(cacheControl, /private/);
  assert.match(cacheControl, /no-cache/);
  assert.equal(headers.get('pragma'), 'no-cache');
  assert.equal(headers.get('expires'), '0');
});

test('applying the headers overwrites anything weaker', () => {
  const headers = new Headers({ 'cache-control': 'public, max-age=3600' });
  applyPrivateCacheHeaders(headers);

  const cacheControl = headers.get('cache-control') ?? '';
  assert.ok(!cacheControl.includes('public'), 'a public cache rule must not survive');
  assert.ok(!cacheControl.includes('max-age=3600'), 'a long max-age must not survive');
  assert.match(cacheControl, /no-store/);
});

test('the exported header set matches what the library sends', () => {
  // Kept in step with @supabase/ssr, which passes these to setAll. Used when the
  // library does not supply them for a given write.
  assert.deepEqual(Object.keys(PRIVATE_CACHE_HEADERS).sort(), ['cache-control', 'expires', 'pragma']);
});
