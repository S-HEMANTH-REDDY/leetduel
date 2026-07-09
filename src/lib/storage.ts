import type { CompetitionState, DailyLog, Problem, UserId } from './types';

function normalizeLog(l: DailyLog): DailyLog {
  const problems: Problem[] = Array.isArray(l.problems)
    ? l.problems.map((p) => ({
        id: p.id,
        number: String(p.number ?? ''),
        title: String(p.title ?? ''),
        difficulty: p.difficulty === 'easy' || p.difficulty === 'hard' ? p.difficulty : 'medium',
      }))
    : [];
  return {
    ...l,
    easy: l.easy ?? 0,
    medium: l.medium ?? 0,
    hard: l.hard ?? 0,
    problems,
    notes: l.notes ?? '',
  };
}

const LOCAL_KEY = 'leetcode-duel-state';
const SESSION_KEY = 'leetcode-duel-session';

/**
 * Shared backend: restful-api.dev (keyless, CORS-enabled, persistent).
 * Site host: GitHub Pages (trusted by browsers).
 * Shared backend: Firebase Realtime Database (reliable, instant, no request cap).
 * Injected at deploy time: VITE_DB_URL.
 */
export const REMOTE = {
  dbUrl: ((import.meta.env.VITE_DB_URL as string | undefined) || '').replace(/\/+$/, ''),
};

export function remoteConfigured(): boolean {
  return Boolean(REMOTE.dbUrl);
}

export function emptyState(): CompetitionState {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    resetAt: now,
    tombstones: {},
    logs: [],
    displayNames: {
      hemanth: 'Hemanth',
      abhiram: 'Abhiram',
    },
    pins: { hemanth: '', abhiram: '' },
    paymentsCleared: { hemanth: 0, abhiram: 0 },
    paymentHistory: [],
  };
}

export function normalizeState(raw: Partial<CompetitionState> | null | undefined): CompetitionState {
  const base = emptyState();
  const r = (raw || {}) as CompetitionState;
  const createdAt = r.createdAt || base.createdAt;
  return {
    version: typeof r.version === 'number' ? r.version : base.version,
    createdAt,
    // Legacy states had no resetAt; fall back to createdAt so nothing is dropped.
    resetAt: r.resetAt || createdAt,
    tombstones:
      r.tombstones && typeof r.tombstones === 'object' ? { ...r.tombstones } : {},
    logs: Array.isArray(r.logs) ? r.logs.map(normalizeLog) : [],
    displayNames: {
      hemanth: r.displayNames?.hemanth ?? 'Hemanth',
      abhiram: r.displayNames?.abhiram ?? 'Abhiram',
    },
    pins: {
      hemanth: r.pins?.hemanth ?? '',
      abhiram: r.pins?.abhiram ?? '',
    },
    paymentsCleared: {
      hemanth: r.paymentsCleared?.hemanth ?? 0,
      abhiram: r.paymentsCleared?.abhiram ?? 0,
    },
    paymentHistory: Array.isArray(r.paymentHistory) ? r.paymentHistory : [],
  };
}

export function readLocal(): CompetitionState {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return emptyState();
    return normalizeState(JSON.parse(raw) as CompetitionState);
  } catch {
    return emptyState();
  }
}

export function writeLocal(state: CompetitionState) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  } catch {
    /* storage full / private mode — ignore */
  }
}

/**
 * Conflict-free merge of two states so the two players never clobber
 * each other. Logs are keyed by user+date and the freshest wins;
 * payments and history are unioned.
 */
export function mergeStates(a: CompetitionState, b: CompetitionState): CompetitionState {
  // The most recent reset wins; anything older than it is discarded.
  const resetAt = (a.resetAt || '') > (b.resetAt || '') ? a.resetAt : b.resetAt;

  // Union tombstones, keeping the latest deletion time per day-key.
  const tombstones: Record<string, string> = {};
  for (const src of [a.tombstones || {}, b.tombstones || {}]) {
    for (const [key, at] of Object.entries(src)) {
      if (!tombstones[key] || at > tombstones[key]) tombstones[key] = at;
    }
  }

  const byKey = new Map<string, DailyLog>();
  for (const log of [...a.logs, ...b.logs]) {
    if (!log || !log.userId || !log.date) continue;
    const key = `${log.userId}|${log.date}`;
    const prev = byKey.get(key);
    if (!prev || (log.updatedAt || '') >= (prev.updatedAt || '')) {
      byKey.set(key, log);
    }
  }
  const logs = [...byKey.values()]
    .filter((log) => {
      // Drop logs from before the last reset.
      if ((log.updatedAt || log.createdAt || '') < (resetAt || '')) return false;
      // Drop logs deleted more recently than they were last edited.
      const del = tombstones[`${log.userId}|${log.date}`];
      if (del && del >= (log.updatedAt || '')) return false;
      return true;
    })
    .sort((x, y) => x.date.localeCompare(y.date) || x.userId.localeCompare(y.userId));

  // Forget tombstones that predate the reset — they're irrelevant now.
  for (const key of Object.keys(tombstones)) {
    if (tombstones[key] < (resetAt || '')) delete tombstones[key];
  }

  const histById = new Map<string, CompetitionState['paymentHistory'][number]>();
  for (const p of [...(a.paymentHistory || []), ...(b.paymentHistory || [])]) {
    if (p && p.id) histById.set(p.id, p);
  }
  const paymentHistory = [...histById.values()].sort((x, y) =>
    (y.paidAt || '').localeCompare(x.paidAt || ''),
  );

  const paymentsCleared = {
    hemanth: Math.max(a.paymentsCleared?.hemanth ?? 0, b.paymentsCleared?.hemanth ?? 0),
    abhiram: Math.max(a.paymentsCleared?.abhiram ?? 0, b.paymentsCleared?.abhiram ?? 0),
  };

  const createdAt =
    a.createdAt && b.createdAt ? (a.createdAt < b.createdAt ? a.createdAt : b.createdAt) : a.createdAt || b.createdAt;

  // Keep whichever PIN is set (a device that just created one wins).
  const pins = {
    hemanth: a.pins?.hemanth || b.pins?.hemanth || '',
    abhiram: a.pins?.abhiram || b.pins?.abhiram || '',
  };

  // Preserve custom display names: a non-default value wins over the default.
  const pickName = (u: UserId, def: string) => {
    const av = a.displayNames?.[u];
    const bv = b.displayNames?.[u];
    if (av && av !== def) return av;
    if (bv && bv !== def) return bv;
    return av || bv || def;
  };
  const displayNames = {
    hemanth: pickName('hemanth', 'Hemanth'),
    abhiram: pickName('abhiram', 'Abhiram'),
  };

  return normalizeState({
    version: Math.max(a.version || 0, b.version || 0) + 1,
    createdAt,
    resetAt,
    tombstones,
    logs,
    displayNames,
    pins,
    paymentsCleared,
    paymentHistory,
  });
}

/** Signature of the meaningful content (ignores version bumps). */
export function signature(state: CompetitionState): string {
  const logs = [...state.logs]
    .sort((x, y) => x.date.localeCompare(y.date) || x.userId.localeCompare(y.userId))
    .map((l) => `${l.userId}|${l.date}|${l.easy}|${l.medium}|${l.hard}|${l.notes}`);
  const hist = state.paymentHistory.map((p) => p.id).sort();
  const tomb = Object.entries(state.tombstones || {})
    .map(([k, v]) => `${k}=${v}`)
    .sort();
  return JSON.stringify({
    logs,
    pc: state.paymentsCleared,
    hist,
    dn: state.displayNames,
    pins: state.pins,
    resetAt: state.resetAt,
    tomb,
  });
}

const REQUEST_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// The whole competition lives at /state in the Realtime Database.
function stateUrl(): string {
  return `${REMOTE.dbUrl}/state.json`;
}

export async function fetchRemote(): Promise<CompetitionState | null> {
  if (!remoteConfigured()) return null;
  const res = await fetchWithTimeout(stateUrl(), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`load ${res.status}`);
  const data = await res.json();
  if (!data) return null; // empty database node
  return normalizeState(data as CompetitionState);
}

export async function saveRemote(state: CompetitionState): Promise<void> {
  if (!remoteConfigured()) return;
  const res = await fetchWithTimeout(stateUrl(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new Error(`save ${res.status}`);
}

export function getSession(): UserId | null {
  const v = sessionStorage.getItem(SESSION_KEY);
  if (v === 'hemanth' || v === 'abhiram') return v;
  return null;
}

export function setSession(userId: UserId | null) {
  if (userId) sessionStorage.setItem(SESSION_KEY, userId);
  else sessionStorage.removeItem(SESSION_KEY);
}
