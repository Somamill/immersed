import { Buffer } from 'node:buffer';
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const config = JSON.parse(readFileSync(new URL('../store-release.json', import.meta.url)));
const keyID = process.env.ASC_KEY_ID;
const issuer = process.env.ASC_ISSUER_ID;
if (!keyID || !issuer) throw new Error('Configure the approved ASC_KEY_ID and ASC_ISSUER_ID.');
const key = createPrivateKey(readFileSync(process.env.ASC_PRIVATE_KEY_PATH || join(homedir(), '.appstoreconnect/private_keys', `AuthKey_${keyID}.p8`)));
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

async function request(path) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'ES256', kid: keyID, typ: 'JWT' })}.${encode({ iss: issuer, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })}`;
  const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  const url = new URL(path, 'https://api.appstoreconnect.apple.com/v1/');
  if (url.origin !== 'https://api.appstoreconnect.apple.com') throw new Error('Unexpected Apple API origin.');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${unsigned}.${signature}` }, signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`Apple API request failed: HTTP ${response.status}. Check key access in App Store Connect.`);
  return response.json();
}

const query = new URLSearchParams({ 'filter[app]': config.appStoreId, limit: '200' });
if (process.argv[2] === 'next-build-number') {
  let url = `builds?${query}`, maximum = 0;
  for (let page = 0; url; page++) {
    if (page >= 50) throw new Error('Build history requires a manual build-number audit.');
    const data = await request(url);
    for (const build of data.data) {
      const version = build.attributes.version;
      if (!/^\d+$/.test(version)) throw new Error('A non-numeric build number requires a manual build-number audit.');
      maximum = Math.max(maximum, Number(version));
    }
    url = data.links?.next;
  }
  const next = maximum + 1;
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `DOT_BUILD_NUMBER=${next}\n`);
  console.log(`Next Apple build number: ${next}`);
} else if (process.argv[2] === 'wait-for-build') {
  const platform = process.argv[3] === 'macos' ? 'MAC_OS' : 'IOS';
  const version = JSON.parse(readFileSync(new URL('../app.json', import.meta.url))).expo.version;
  const number = process.env.DOT_BUILD_NUMBER;
  if (!/^\d+$/.test(number || '')) throw new Error('DOT_BUILD_NUMBER is required.');
  const deadline = Date.now() + 20 * 60 * 1000;
  query.set('include', 'preReleaseVersion');
  while (Date.now() < deadline) {
    const data = await request(`builds?${query}`);
    const releases = new Map((data.included || []).map(item => [item.id, item.attributes]));
    const build = data.data.find(item => {
      const release = releases.get(item.relationships.preReleaseVersion.data.id);
      return item.attributes.version === number && release?.version === version && release.platform === platform;
    });
    if (build?.attributes.processingState === 'VALID') {
      console.log(`Apple processed ${version} (${number}) for ${platform}. Verify tester access in TestFlight.`);
      process.exit(0);
    }
    if (build && ['FAILED', 'INVALID'].includes(build.attributes.processingState)) throw new Error('Apple rejected build processing; inspect App Store Connect diagnostics.');
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
  throw new Error('Apple processing has not completed; inspect App Store Connect before retrying delivery.');
} else {
  throw new Error('Use next-build-number or wait-for-build ios|macos.');
}
