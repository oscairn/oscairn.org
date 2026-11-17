// Fails the build unless the publisher identity file, CNAME and .nojekyll are in dist/ exactly as they must be.
// The identity file is what the package tools fetch at https://oscairn.org/.well-known/oscairn-publisher.json
// (RFC 0031), so it must be byte-identical to the one first published on this repository's main branch.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const dist = path.resolve(process.argv[2] || 'dist');
const expected = fs.readFileSync('identity.sha256', 'utf8').trim();
const problems = [];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const file = path.join(dist, '.well-known/oscairn-publisher.json');
if (!fs.existsSync(file)) problems.push('dist/.well-known/oscairn-publisher.json is missing');
else if (sha(fs.readFileSync(file)) !== expected) problems.push(`dist/.well-known/oscairn-publisher.json differs: sha256 ${sha(fs.readFileSync(file))}, expected ${expected} (identity.sha256)`);

// Where a main branch is visible, the pinned hash must also match the file on it.
for (const ref of ['origin/main', 'main']) {
  try {
    const blob = execFileSync('git', ['show', `${ref}:.well-known/oscairn-publisher.json`], { stdio: ['ignore', 'pipe', 'ignore'] });
    if (sha(blob) !== expected) problems.push(`identity.sha256 does not match .well-known/oscairn-publisher.json on ${ref}`);
    break;
  } catch { /* no such ref: the pinned hash alone is checked */ }
}
if (!fs.existsSync(path.join(dist, '.nojekyll'))) problems.push('dist/.nojekyll is missing (Pages would drop the dot-folder)');
const cname = path.join(dist, 'CNAME');
if (!fs.existsSync(cname) || fs.readFileSync(cname, 'utf8').trim() !== 'oscairn.org') problems.push('dist/CNAME is missing or is not oscairn.org');

if (problems.length) { console.error('identity check FAILED:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`identity check ok: .well-known/oscairn-publisher.json sha256 ${expected}, .nojekyll and CNAME present`);
