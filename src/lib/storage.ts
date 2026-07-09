import type { CompetitionState, UserId } from './types';

const LOCAL_KEY = 'leetcode-duel-state';
const SESSION_KEY = 'leetcode-duel-session';

/**
 * Shared backend: JSONBlob (CORS-friendly).
 * Site host: GitHub Pages (trusted by Brave / Safe Browsing).
 * Credentials are injected at deploy time via VITE_* env vars.
 */
export const REMOTE = {
  baseUrl: 'https://jsonblob.com/api/jsonBlob',
  id: import.meta.env.VITE_JB_ID as string | undefined,
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
      friend: 'Friend',
    },
    paymentsCleared: { hemanth: 0, friend: 0 },
    paymentHistory: [],
  };
}

/** Backfill fields added after the first deploy. */
export function normalizeState(raw: CompetitionState): CompetitionState {
  return {
    ...emptyState(),
    ...raw,
    displayNames: {
      hemanth: raw.displayNames?.hemanth ?? 'Hemanth',
      friend: raw.displayNames?.friend ?? 'Friend',
    },
    logs: Array.isArray(raw.logs) ? raw.logs : [],
    paymentsCleared: {
      hemanth: raw.paymentsCleared?.hemanth ?? 0,
      friend: raw.paymentsCleared?.friend ?? 0,
    },
    paymentHistory: Array.isArray(raw.paymentHistory) ? raw.paymentHistory : [],
  };
}

function readLocal(): CompetitionState {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return emptyState();
    return normalizeState(JSON.parse(raw) as CompetitionState);
  } catch {
    return emptyState();
  }
}

function writeLocal(state: CompetitionState) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
}

async function fetchRemote(): Promise<CompetitionState | null> {
  if (!remoteConfigured()) return null;
  const res = await fetch(`${REMOTE.baseUrl}/${REMOTE.id}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to load remote state (${res.status})`);
  const data = await res.json();
  return normalizeState(data as CompetitionState);
}

async function saveRemote(state: CompetitionState): Promise<void> {
  if (!remoteConfigured()) return;
  const res = await fetch(`${REMOTE.baseUrl}/${REMOTE.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(state),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to save remote state (${res.status}): ${text}`);
  }
}

export async function loadState(): Promise<CompetitionState> {
  if (remoteConfigured()) {
    try {
      const remote = await fetchRemote();
      if (remote) {
        writeLocal(remote);
        return remote;
      }
    } catch (err) {
      console.warn('Remote load failed, using local cache', err);
    }
  }
  return readLocal();
}

export async function saveState(state: CompetitionState): Promise<CompetitionState> {
  const next = { ...state, version: state.version + 1 };
  writeLocal(next);
  if (remoteConfigured()) {
    await saveRemote(next);
  }
  return next;
}

export function getSession(): UserId | null {
  const v = sessionStorage.getItem(SESSION_KEY);
  if (v === 'hemanth' || v === 'friend') return v;
  return null;
}

export function setSession(userId: UserId | null) {
  if (userId) sessionStorage.setItem(SESSION_KEY, userId);
  else sessionStorage.removeItem(SESSION_KEY);
}

export async function resetCompetition(): Promise<CompetitionState> {
  return saveState(emptyState());
}
