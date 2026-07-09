#!/usr/bin/env node
/**
 * Deploys LeetDuel to GitHub Pages via Actions (trusted by Brave)
 * + JSONBlob for shared competition state.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const META_PATH = join(root, '.deploy-meta.json');
const REPO = 'leetduel';
const OWNER = 'S-HEMANTH-REDDY';

function loadMeta() {
  if (!existsSync(META_PATH)) return null;
  try {
    return JSON.parse(readFileSync(META_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function sh(cmd, cwd = root) {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function shOut(cmd, cwd = root) {
  return execSync(cmd, { cwd, encoding: 'utf8' }).trim();
}

async function ensureJsonBlob(existingId) {
  const emptyState = {
    version: 1,
    createdAt: new Date().toISOString(),
    logs: [],
    displayNames: { hemanth: 'Hemanth', friend: 'Friend' },
    paymentsCleared: { hemanth: 0, friend: 0 },
    paymentHistory: [],
  };

  if (existingId) {
    const check = await fetch(`https://jsonblob.com/api/jsonBlob/${existingId}`, {
      headers: { Accept: 'application/json' },
    });
    if (check.ok) {
      console.log(`→ Reusing JSONBlob ${existingId}`);
      return existingId;
    }
    console.log('→ Previous JSONBlob missing; creating a new one…');
  }

  console.log('→ Creating shared JSONBlob…');
  const res = await fetch('https://jsonblob.com/api/jsonBlob', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(emptyState),
  });
  if (!res.ok) {
    throw new Error(`JSONBlob create failed (${res.status}): ${await res.text()}`);
  }
  const loc = res.headers.get('Location') || res.headers.get('location') || '';
  const id = loc.split('/').filter(Boolean).pop();
  if (!id) throw new Error('No JSONBlob id returned from Location header');
  console.log(`→ JSONBlob id: ${id}`);
  return id;
}

function ensureRepo() {
  try {
    shOut(`gh repo view ${OWNER}/${REPO} --json name -q .name`);
    console.log(`→ Repo ${OWNER}/${REPO} exists`);
  } catch {
    console.log(`→ Creating public repo ${OWNER}/${REPO}…`);
    sh(
      `gh repo create ${OWNER}/${REPO} --public --description "LeetDuel — daily coding competition" --add-readme`,
    );
  }
}

function pushSourceAndDeploy(blobId) {
  // Secret for Actions build
  console.log('→ Setting VITE_JB_ID secret…');
  try {
    sh(`gh secret set VITE_JB_ID --repo ${OWNER}/${REPO} --body "${blobId}"`);
  } catch (e) {
    console.warn('Secret set failed, trying echo pipe…');
    execSync(`gh secret set VITE_JB_ID --repo ${OWNER}/${REPO}`, {
      cwd: root,
      input: blobId,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  }

  // Switch Pages to GitHub Actions
  console.log('→ Configuring Pages to use GitHub Actions…');
  try {
    execSync(
      `gh api -X PUT repos/${OWNER}/${REPO}/pages --input -`,
      {
        cwd: root,
        input: JSON.stringify({ build_type: 'workflow' }),
        stdio: ['pipe', 'inherit', 'inherit'],
      },
    );
  } catch {
    console.log('→ Pages workflow config may already be set');
  }

  const work = join(root, '.src-push-tmp');
  rmSync(work, { recursive: true, force: true });
  console.log('→ Cloning main and syncing source…');
  sh(`git clone --depth 1 https://github.com/${OWNER}/${REPO}.git "${work}"`);

  // Remove everything except .git
  for (const name of readdirSync(work)) {
    if (name === '.git') continue;
    rmSync(join(work, name), { recursive: true, force: true });
  }

  // Copy project files (exclude node_modules, dist, git, deploy meta)
  const skip = new Set([
    'node_modules',
    'dist',
    '.git',
    '.gh-pages-tmp',
    '.src-push-tmp',
    '.deploy-meta.json',
    'leetduel-site.zip',
    '.env.production',
    '.env.local',
  ]);
  for (const name of readdirSync(root)) {
    if (skip.has(name)) continue;
    cpSync(join(root, name), join(work, name), { recursive: true });
  }

  // Ensure package-lock exists for npm ci
  if (!existsSync(join(work, 'package-lock.json'))) {
    throw new Error('package-lock.json missing — run npm install first');
  }

  sh('git add -A', work);
  const status = shOut('git status --porcelain', work);
  if (status) {
    sh(
      'git -c user.email="leetduel@users.noreply.github.com" -c user.name="LeetDuel Deploy" commit -m "Deploy LeetDuel source for GitHub Pages"',
      work,
    );
    sh('git push origin HEAD:main', work);
  } else {
    console.log('→ No source changes; triggering workflow…');
    try {
      sh(`gh workflow run deploy-pages.yml --repo ${OWNER}/${REPO}`);
    } catch {
      /* may not exist yet until push */
    }
  }

  rmSync(work, { recursive: true, force: true });

  console.log('→ Waiting for Actions deploy…');
  // Give Actions a moment to register
  execSync('sleep 8');
  try {
    sh(`gh run watch --repo ${OWNER}/${REPO} --exit-status`, root);
  } catch {
    // Fallback: find latest run and watch it
    try {
      const id = shOut(
        `gh run list --repo ${OWNER}/${REPO} --workflow=deploy-pages.yml --limit 1 --json databaseId -q '.[0].databaseId'`,
      );
      if (id) sh(`gh run watch ${id} --repo ${OWNER}/${REPO} --exit-status`);
    } catch (e) {
      console.warn('Could not watch run automatically; check Actions tab.');
    }
  }
}

async function main() {
  const existing = loadMeta();
  const blobId = await ensureJsonBlob(existing?.jsonBlobId || existing?.jbId);
  ensureRepo();
  pushSourceAndDeploy(blobId);

  const link = `https://${OWNER.toLowerCase()}.github.io/${REPO}/`;
  writeFileSync(
    META_PATH,
    JSON.stringify(
      {
        deployedAt: new Date().toISOString(),
        host: 'github-pages',
        owner: OWNER,
        repo: REPO,
        jsonBlobId: blobId,
        link,
      },
      null,
      2,
    ),
  );

  console.log('\n========================================');
  console.log('LeetDuel is live (no Brave warning)');
  console.log('========================================');
  console.log(`URL:  ${link}`);
  console.log('');
  console.log('Login: tap your name (Hemanth or Friend) — no password.');
  console.log('========================================\n');
}

main().catch((err) => {
  console.error('\nDeploy failed:', err.message || err);
  process.exit(1);
});
