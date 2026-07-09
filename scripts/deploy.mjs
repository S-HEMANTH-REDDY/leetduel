#!/usr/bin/env node
/**
 * Deploys LeetDuel to GitHub Pages (Brave-trusted) with a shared
 * restful-api.dev object for state (keyless, CORS, persistent).
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const META_PATH = join(root, '.deploy-meta.json');
const REPO = 'leetduel';
const OWNER = 'S-HEMANTH-REDDY';
const API_BASE = 'https://api.restful-api.dev/objects';

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
function secret(name, value) {
  execSync(`gh secret set ${name} --repo ${OWNER}/${REPO}`, {
    cwd: root,
    input: value,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

const emptyState = () => ({
  version: 1,
  createdAt: new Date().toISOString(),
  logs: [],
  displayNames: { hemanth: 'Hemanth', abhiram: 'Abhiram' },
  paymentsCleared: { hemanth: 0, abhiram: 0 },
  paymentHistory: [],
});

async function ensureApiObject(meta) {
  if (meta?.apiId) {
    // Reuse the existing object unless it is *definitively* gone (404).
    // Rate-limit (405/429) or transient errors must NOT trigger a recreate,
    // otherwise a deploy would silently wipe both players' shared data.
    let status = 0;
    try {
      const check = await fetch(`${API_BASE}/${meta.apiId}`);
      status = check.status;
    } catch {
      status = 0; // network error — assume it still exists
    }
    if (status !== 404) {
      console.log(`→ Reusing shared state object ${meta.apiId} (verify status ${status || 'n/a'})`);
      return meta.apiId;
    }
    console.log('→ Previous state object is gone (404); creating a new one…');
  }
  console.log('→ Creating shared state object…');
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'LeetDuel', data: emptyState() }),
  });
  if (!res.ok) throw new Error(`state object create failed (${res.status}): ${await res.text()}`);
  const body = await res.json();
  if (!body.id) throw new Error('No id returned for state object');
  console.log(`→ State object id ${body.id}`);
  return body.id;
}

function ensureRepo() {
  try {
    shOut(`gh repo view ${OWNER}/${REPO} --json name -q .name`);
    console.log(`→ Repo ${OWNER}/${REPO} exists`);
  } catch {
    sh(`gh repo create ${OWNER}/${REPO} --public --description "LeetDuel — daily coding competition" --add-readme`);
  }
}

const WORKFLOW = `name: Deploy LeetDuel to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          VITE_API_BASE: \${{ secrets.VITE_API_BASE }}
          VITE_API_ID: \${{ secrets.VITE_API_ID }}
      - name: Prepare Pages artifact
        run: |
          cp dist/index.html dist/404.html
          touch dist/.nojekyll
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`;

function pushAndDeploy(apiId) {
  console.log('→ Setting Actions secrets…');
  secret('VITE_API_BASE', API_BASE);
  secret('VITE_API_ID', apiId);

  writeFileSync(join(root, '.env.production'), `VITE_API_BASE=${API_BASE}\nVITE_API_ID=${apiId}\n`);

  try {
    execSync(`gh api -X PUT repos/${OWNER}/${REPO}/pages --input -`, {
      cwd: root,
      input: JSON.stringify({ build_type: 'workflow' }),
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  } catch {
    /* already set */
  }

  const work = join(root, '.src-push-tmp');
  rmSync(work, { recursive: true, force: true });
  sh(`git clone --depth 1 https://github.com/${OWNER}/${REPO}.git "${work}"`);
  for (const name of readdirSync(work)) {
    if (name === '.git') continue;
    rmSync(join(work, name), { recursive: true, force: true });
  }
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
  writeFileSync(join(work, '.github/workflows/deploy-pages.yml'), WORKFLOW);

  sh('git add -A', work);
  const status = shOut('git status --porcelain', work);
  if (status) {
    sh(
      'git -c user.email="leetduel@users.noreply.github.com" -c user.name="LeetDuel Deploy" commit -m "Fast optimistic sync + rename Abhiram"',
      work,
    );
    sh('git push origin HEAD:main', work);
  } else {
    sh(`gh workflow run deploy-pages.yml --repo ${OWNER}/${REPO}`);
  }
  rmSync(work, { recursive: true, force: true });

  console.log('→ Waiting for build…');
  execSync('sleep 12');
  const runId = shOut(
    `gh run list --repo ${OWNER}/${REPO} --workflow=deploy-pages.yml --limit 1 --json databaseId -q '.[0].databaseId'`,
  );
  for (let i = 0; i < 40; i++) {
    const conclusion = shOut(
      `gh run view ${runId} --repo ${OWNER}/${REPO} --json jobs -q '.jobs[] | select(.name=="build") | .conclusion'`,
    );
    if (conclusion === 'success' || conclusion === 'failure') {
      console.log(`  build ${conclusion}`);
      break;
    }
    execSync('sleep 5');
  }

  for (let i = 0; i < 30; i++) {
    const html = execSync('curl -sS https://s-hemanth-reddy.github.io/leetduel/', { encoding: 'utf8' });
    const asset = /\/leetduel\/assets\/[^"]+\.js/.exec(html)?.[0];
    if (asset) {
      const js = execSync(`curl -sS https://s-hemanth-reddy.github.io${asset}`, { encoding: 'utf8' });
      if (js.includes(apiId)) {
        console.log('→ Live site updated with new build');
        return;
      }
    }
    console.log(`  waiting for Pages CDN… (${i + 1})`);
    execSync('sleep 10');
  }
  console.log('→ Build done; CDN may still be catching up (hard refresh in a minute).');
}

async function main() {
  ensureRepo();
  const meta = loadMeta();
  const apiId = await ensureApiObject(meta);
  pushAndDeploy(apiId);

  const link = `https://${OWNER.toLowerCase()}.github.io/${REPO}/`;
  writeFileSync(
    META_PATH,
    JSON.stringify(
      { deployedAt: new Date().toISOString(), host: 'github-pages', owner: OWNER, repo: REPO, apiBase: API_BASE, apiId, link },
      null,
      2,
    ),
  );

  console.log('\n========================================');
  console.log('LeetDuel updated');
  console.log('========================================');
  console.log(`URL:  ${link}`);
  console.log('Login: tap Hemanth or Abhiram (no password)');
  console.log('========================================\n');
}

main().catch((err) => {
  console.error('\nDeploy failed:', err.message || err);
  process.exit(1);
});
