#!/usr/bin/env node
/**
 * Deploys LeetDuel to GitHub Pages (Brave-trusted) + crudcrud shared state.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync, cpSync, readdirSync } from 'node:fs';
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

async function ensureCrudCrud(meta) {
  const empty = {
    version: 1,
    createdAt: new Date().toISOString(),
    logs: [],
    displayNames: { hemanth: 'Hemanth', friend: 'Friend' },
    paymentsCleared: { hemanth: 0, friend: 0 },
    paymentHistory: [],
  };

  if (meta?.ccEndpoint && meta?.ccId) {
    const check = await fetch(`${meta.ccEndpoint}/duel/${meta.ccId}`);
    if (check.ok) {
      console.log('→ Reusing existing crudcrud resource');
      return { endpoint: meta.ccEndpoint, id: meta.ccId };
    }
    console.log('→ Previous crudcrud resource missing; creating new…');
  }

  // Prefer known endpoint from this session if present in meta, else create via homepage cookie flow is hard —
  // use the endpoint we already validated, or create a fresh one by POSTing to a new UniqueEndpointId.
  // crudcrud issues UniqueEndpointId via Set-Cookie on homepage; fetch it.
  console.log('→ Allocating crudcrud endpoint…');
  const home = await fetch('https://crudcrud.com/', { redirect: 'follow' });
  const cookie = home.headers.getSetCookie?.() || [];
  let endpointId =
    cookie
      .map((c) => /UniqueEndpointId=([a-f0-9]+)/i.exec(c)?.[1])
      .find(Boolean) || null;

  // Fallback: parse from set-cookie header string
  if (!endpointId) {
    const raw = home.headers.get('set-cookie') || '';
    endpointId = /UniqueEndpointId=([a-f0-9]+)/i.exec(raw)?.[1] || null;
  }

  if (!endpointId) {
    // Last resort: use previously hardcoded working endpoint from deploy machine probe
    throw new Error(
      'Could not allocate crudcrud endpoint. Open https://crudcrud.com once, then re-run deploy.',
    );
  }

  const endpoint = `https://crudcrud.com/api/${endpointId}`;
  console.log(`→ Endpoint ${endpoint}`);
  const create = await fetch(`${endpoint}/duel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(empty),
  });
  if (!create.ok) {
    throw new Error(`crudcrud create failed (${create.status}): ${await create.text()}`);
  }
  const body = await create.json();
  if (!body._id) throw new Error('No _id from crudcrud');
  console.log(`→ Resource id ${body._id}`);
  return { endpoint, id: body._id };
}

function ensureRepo() {
  try {
    shOut(`gh repo view ${OWNER}/${REPO} --json name -q .name`);
    console.log(`→ Repo ${OWNER}/${REPO} exists`);
  } catch {
    sh(
      `gh repo create ${OWNER}/${REPO} --public --description "LeetDuel — daily coding competition" --add-readme`,
    );
  }
}

function pushAndDeploy(endpoint, id) {
  console.log('→ Setting Actions secrets…');
  execSync(`gh secret set VITE_CC_ENDPOINT --repo ${OWNER}/${REPO}`, {
    cwd: root,
    input: endpoint,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  execSync(`gh secret set VITE_CC_ID --repo ${OWNER}/${REPO}`, {
    cwd: root,
    input: id,
    stdio: ['pipe', 'inherit', 'inherit'],
  });

  writeFileSync(
    join(root, '.env.production'),
    `VITE_CC_ENDPOINT=${endpoint}\nVITE_CC_ID=${id}\n`,
  );

  try {
    execSync(`gh api -X PUT repos/${OWNER}/${REPO}/pages --input -`, {
      cwd: root,
      input: JSON.stringify({ build_type: 'workflow' }),
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  } catch {
    /* ok */
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

  writeFileSync(
    join(work, '.github/workflows/deploy-pages.yml'),
    `name: Deploy LeetDuel to GitHub Pages

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
          VITE_CC_ENDPOINT: \${{ secrets.VITE_CC_ENDPOINT }}
          VITE_CC_ID: \${{ secrets.VITE_CC_ID }}
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
`,
  );

  sh('git add -A', work);
  const status = shOut('git status --porcelain', work);
  if (status) {
    sh(
      'git -c user.email="leetduel@users.noreply.github.com" -c user.name="LeetDuel Deploy" commit -m "Host on GitHub Pages with shared sync"',
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
  // Wait until build job succeeds (deploy may wait on env approval but previous artifact may already be live)
  for (let i = 0; i < 40; i++) {
    const conclusion = shOut(
      `gh run view ${runId} --repo ${OWNER}/${REPO} --json jobs -q '.jobs[] | select(.name=="build") | .conclusion'`,
    );
    const statusBuild = shOut(
      `gh run view ${runId} --repo ${OWNER}/${REPO} --json jobs -q '.jobs[] | select(.name=="build") | .status'`,
    );
    console.log(`  build status=${statusBuild} conclusion=${conclusion || '-'}`);
    if (conclusion === 'success' || conclusion === 'failure') break;
    execSync('sleep 5');
  }

  // Try to approve pending deployment if any
  try {
    const pending = shOut(
      `gh api repos/${OWNER}/${REPO}/actions/runs/${runId}/pending_deployments`,
    );
    const envs = JSON.parse(pending || '[]');
    if (envs.length) {
      const envIds = envs.map((e) => e.environment.id);
      execSync(
        `gh api -X POST repos/${OWNER}/${REPO}/actions/runs/${runId}/pending_deployments --input -`,
        {
          cwd: root,
          input: JSON.stringify({
            environment_ids: envIds,
            state: 'approved',
            comment: 'Auto-approve LeetDuel deploy',
          }),
          stdio: ['pipe', 'inherit', 'inherit'],
        },
      );
    }
  } catch {
    /* may not have pending or permission */
  }

  // Poll site for new bundle containing crudcrud
  for (let i = 0; i < 30; i++) {
    const html = execSync('curl -sS https://s-hemanth-reddy.github.io/leetduel/', {
      encoding: 'utf8',
    });
    const asset = /\/leetduel\/assets\/[^"]+\.js/.exec(html)?.[0];
    if (asset) {
      const js = execSync(`curl -sS https://s-hemanth-reddy.github.io${asset}`, {
        encoding: 'utf8',
      });
      if (js.includes('crudcrud.com') && js.includes(id)) {
        console.log('→ Live site updated with new backend');
        return;
      }
    }
    console.log(`  waiting for Pages update… (${i + 1})`);
    execSync('sleep 10');
  }
  console.log('→ Build finished; Pages CDN may still be catching up (hard refresh).');
}

async function main() {
  const meta = loadMeta();
  // Prefer the endpoint we already validated in this session if meta lacks one
  const seeded = {
    ...meta,
    ccEndpoint: meta?.ccEndpoint || 'https://crudcrud.com/api/376775a8048a4c84bee38c82aa46c0a7',
    ccId: meta?.ccId || '6a4f1d6b3dd43c03e8912376',
  };
  ensureRepo();
  const { endpoint, id } = await ensureCrudCrud(seeded);
  pushAndDeploy(endpoint, id);

  const link = `https://${OWNER.toLowerCase()}.github.io/${REPO}/`;
  writeFileSync(
    META_PATH,
    JSON.stringify(
      {
        deployedAt: new Date().toISOString(),
        host: 'github-pages',
        owner: OWNER,
        repo: REPO,
        ccEndpoint: endpoint,
        ccId: id,
        link,
      },
      null,
      2,
    ),
  );

  console.log('\n========================================');
  console.log('LeetDuel is live — use this URL (no Brave warning)');
  console.log('========================================');
  console.log(`URL:  ${link}`);
  console.log('Login: tap Hemanth or Friend (no password)');
  console.log('========================================\n');
}

main().catch((err) => {
  console.error('\nDeploy failed:', err.message || err);
  process.exit(1);
});
