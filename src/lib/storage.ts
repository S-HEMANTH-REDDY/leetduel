import type { CompetitionState, UserId } from './types';

const LOCAL_KEY = 'leetcode-duel-state';
const SESSION_KEY = 'leetcode-duel-session';

/**
 * Shared backend: crudcrud.com (CORS-friendly).
 * Site host: GitHub Pages (trusted by Brave).
 * Injected at deploy: VITE_CC_ENDPOINT, VITE_CC_ID
 */
export const REMOTE = {
  endpoint: import.meta.env.VITE_CC_ENDPOINT as string | undefined,
  id: import.meta.env.VITE_CC_ID as string | undefined,
};

export function remoteConfigured(): boolean {
  return Boolean(REMOTE.endpoint && REMOTE.id);
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

export function normalizeState(raw: CompetitionState & { _id?: string }): CompetitionState {
  const { _id: _ignored, ...rest } = raw as CompetitionState & { _id?: string };
  void _ignored;
  return {
    ...emptyState(),
    ...rest,
    displayNames: {
      hemanth: rest.displayNames?.hemanth ?? 'Hemanth',
      friend: rest.displayNames?.friend ?? 'Friend',
    },
    logs: Array.isArray(rest.logs) ? rest.logs : [],
    paymentsCleared: {
      hemanth: rest.paymentsCleared?.hemanth ?? 0,
      friend: rest.paymentsCleared?.friend ?? 0,
    },
    paymentHistory: Array.isArray(rest.paymentHistory) ? rest.paymentHistory : [],
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

function resourceUrl() {
  return `${REMOTE.endpoint}/duel/${REMOTE.id}`;
}

async function fetchRemote(): Promise<CompetitionState | null> {
  if (!remoteConfigured()) return null;
  const res = await fetch(resourceUrl(), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to load remote state (${res.status})`);
  const data = await res.json();
  return normalizeState(data as CompetitionState);
}

async function saveRemote(state: CompetitionState): Promise<void> {
  if (!remoteConfigured()) return;
  // crudcrud PUT body must NOT include _id
  const res = await fetch(resourceUrl(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(state),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to save remote state (${res.status}): ${text.slice(0, 200)}`);
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
