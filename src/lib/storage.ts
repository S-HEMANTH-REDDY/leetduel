import type { CompetitionState, DailyLog, UserId } from './types';

const LOCAL_KEY = 'leetcode-duel-state';
const SESSION_KEY = 'leetcode-duel-session';

/**
 * Shared backend: restful-api.dev (keyless, CORS-enabled, persistent).
 * Site host: GitHub Pages (trusted by browsers).
 * Injected at deploy time: VITE_API_BASE, VITE_API_ID.
 */
export const REMOTE = {
  base: (import.meta.env.VITE_API_BASE as string | undefined) || 'https://api.restful-api.dev/objects',
  id: import.meta.env.VITE_API_ID as string | undefined,
};

export function remoteConfigured(): boolean {
  return Boolean(REMOTE.id);
}

export function emptyState(): CompetitionState {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    logs: [],
    displayNames: {
      hemanth: 'Hemanth',
      abhiram: 'Abhiram',
    },
    paymentsCleared: { hemanth: 0, abhiram: 0 },
    paymentHistory: [],
  };
}

export function normalizeState(raw: Partial<CompetitionState> | null | undefined): CompetitionState {
  const base = emptyState();
  const r = (raw || {}) as CompetitionState;
  return {
    version: typeof r.version === 'number' ? r.version : base.version,
    createdAt: r.createdAt || base.createdAt,
    logs: Array.isArray(r.logs) ? r.logs : [],
    displayNames: {
      hemanth: r.displayNames?.hemanth ?? 'Hemanth',
      abhiram: r.displayNames?.abhiram ?? 'Abhiram',
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
  const byKey = new Map<string, DailyLog>();
  for (const log of [...a.logs, ...b.logs]) {
    if (!log || !log.userId || !log.date) continue;
    const key = `${log.userId}|${log.date}`;
    const prev = byKey.get(key);
    if (!prev || (log.updatedAt || '') >= (prev.updatedAt || '')) {
      byKey.set(key, log);
    }
  }
  const logs = [...byKey.values()].sort(
    (x, y) => x.date.localeCompare(y.date) || x.userId.localeCompare(y.userId),
  );

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

  return normalizeState({
    version: Math.max(a.version || 0, b.version || 0) + 1,
    createdAt,
    logs,
    displayNames: { hemanth: 'Hemanth', abhiram: 'Abhiram' },
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
  return JSON.stringify({
    logs,
    pc: state.paymentsCleared,
    hist,
    dn: state.displayNames,
  });
}

const REQUEST_TIMEOUT_MS = 8000;

async function withTimeout<T>(p: Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await p;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRemote(): Promise<CompetitionState | null> {
  if (!remoteConfigured()) return null;
  const res = await withTimeout(
    fetch(`${REMOTE.base}/${REMOTE.id}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    }),
  );
  if (!res.ok) throw new Error(`load ${res.status}`);
  const obj = await res.json();
  const data = obj && typeof obj === 'object' && 'data' in obj ? obj.data : obj;
  return normalizeState(data as CompetitionState);
}

export async function saveRemote(state: CompetitionState): Promise<void> {
  if (!remoteConfigured()) return;
  const res = await withTimeout(
    fetch(`${REMOTE.base}/${REMOTE.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'LeetDuel', data: state }),
    }),
  );
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
