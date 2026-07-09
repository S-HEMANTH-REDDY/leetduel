import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  USERS,
  type CompetitionState,
  type DailyLog,
  type Problem,
  type User,
  type UserId,
} from './types';
import {
  emptyState,
  fetchRemote,
  getSession,
  mergeStates,
  normalizeState,
  readLocal,
  remoteConfigured,
  saveRemote,
  setSession,
  signature,
  writeLocal,
} from './storage';
import { computePayTab, countsFromProblems, todayKey } from './scoring';

export type SyncStatus = 'idle' | 'syncing' | 'saved' | 'error';

// Lightweight PIN hashing — deters casual impersonation between two friends.
const PIN_SALT = 'leetduel::v1::';
async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(PIN_SALT + pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface UpsertInput {
  problems: Problem[];
  notes: string;
}

interface AppContextValue {
  ready: boolean;
  user: User | null;
  state: CompetitionState;
  syncStatus: SyncStatus;
  online: boolean;
  hasPin: (userId: UserId) => boolean;
  createPin: (userId: UserId, pin: string) => Promise<boolean>;
  loginWithPin: (userId: UserId, pin: string) => Promise<boolean>;
  logout: () => void;
  refresh: () => void;
  upsertLog: (input: UpsertInput) => Promise<{ log: DailyLog; isNew: boolean; goalJustMet: boolean }>;
  deleteLog: (logId: string) => void;
  resetAll: () => void;
  updateDisplayName: (userId: UserId, name: string) => void;
  markPaid: (userId: UserId) => void;
  undoPayment: (userId: UserId) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [state, setStateReact] = useState<CompetitionState>(() => readLocal());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [online, setOnline] = useState(true);

  const stateRef = useRef(state);
  const dirtyRef = useRef(false);
  const syncingRef = useRef(false);
  const pendingRef = useRef(false);
  const debounceRef = useRef<number | null>(null);
  const lastPullRef = useRef(0);
  const failCountRef = useRef(0);

  // Free keyless backends cap daily requests, so pull sparingly.
  const MIN_PULL_INTERVAL_MS = 45_000;
  const POLL_INTERVAL_MS = 5 * 60_000;

  const applyState = useCallback((next: CompetitionState) => {
    stateRef.current = next;
    setStateReact(next);
    writeLocal(next);
  }, []);

  // Pull remote, merge with local, adopt, and push if we have local changes.
  const runSync = useCallback(async () => {
    if (!remoteConfigured()) {
      dirtyRef.current = false;
      return;
    }
    // Skip pull-only syncs that happen too soon; still allow pushes.
    if (!dirtyRef.current && Date.now() - lastPullRef.current < MIN_PULL_INTERVAL_MS) {
      return;
    }
    if (syncingRef.current) {
      pendingRef.current = true;
      return;
    }
    syncingRef.current = true;
    setSyncStatus('syncing');
    try {
      let remote: CompetitionState | null = null;
      let fetchOk = false;
      try {
        remote = await fetchRemote();
        fetchOk = true;
        lastPullRef.current = Date.now();
      } catch {
        remote = null;
      }

      const local = stateRef.current;
      const merged = remote ? mergeStates(remote, local) : local;

      if (signature(merged) !== signature(local)) {
        applyState(merged);
      }

      const needPush = !remote || signature(merged) !== signature(remote);
      let pushOk = true;
      if (needPush) {
        try {
          await saveRemote(merged);
        } catch {
          pushOk = false;
        }
      }

      if (fetchOk && pushOk) {
        dirtyRef.current = false;
        failCountRef.current = 0;
        setSyncStatus('saved');
        setOnline(true);
      } else {
        // Backend unreachable/capped. Data is safe locally; retry later quietly.
        if (needPush && !pushOk) dirtyRef.current = true;
        failCountRef.current += 1;
        setSyncStatus(failCountRef.current >= 2 ? 'error' : 'saved');
        setOnline(false);
      }
    } catch {
      failCountRef.current += 1;
      setSyncStatus(failCountRef.current >= 2 ? 'error' : 'saved');
      setOnline(false);
    } finally {
      syncingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        void runSync();
      }
    }
  }, [applyState]);

  const scheduleSync = useCallback(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void runSync();
    }, 250);
  }, [runSync]);

  // Overwrite remote regardless of its contents (used for reset).
  const overwrite = useCallback(
    async (next: CompetitionState) => {
      applyState(next);
      if (!remoteConfigured()) return;
      setSyncStatus('syncing');
      try {
        await saveRemote(next);
        setSyncStatus('saved');
        setOnline(true);
      } catch {
        setSyncStatus('error');
        setOnline(false);
      }
    },
    [applyState],
  );

  // Initial load + session
  useEffect(() => {
    const session = getSession();
    if (session) setUser(USERS.find((u) => u.id === session) ?? null);
    (async () => {
      await runSync();
      setReady(true);
    })();
  }, [runSync]);

  // Poll gently, and only while the tab is actually visible.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void runSync();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [runSync]);

  // Sync on focus / tab becoming visible / reconnect
  useEffect(() => {
    const onFocus = () => void runSync();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runSync();
    };
    const onOnline = () => {
      setOnline(true);
      void runSync();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [runSync]);

  const hasPin = useCallback(
    (userId: UserId) => Boolean(stateRef.current.pins?.[userId]),
    [],
  );

  const loginWithPin = useCallback(async (userId: UserId, pin: string) => {
    const found = USERS.find((u) => u.id === userId);
    if (!found) return false;
    const stored = stateRef.current.pins?.[userId];
    if (!stored) return false;
    const hash = await hashPin(pin);
    if (hash !== stored) return false;
    setSession(found.id);
    setUser(found);
    return true;
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    setUser(null);
  }, []);

  const refresh = useCallback(() => {
    lastPullRef.current = 0; // force an immediate pull
    void runSync();
  }, [runSync]);

  const commit = useCallback(
    (mutator: (cur: CompetitionState) => CompetitionState) => {
      const cur = stateRef.current;
      const next = normalizeState({ ...mutator(cur), version: (cur.version || 0) + 1 });
      applyState(next);
      dirtyRef.current = true;
      setSyncStatus('syncing');
      scheduleSync();
      return next;
    },
    [applyState, scheduleSync],
  );

  const createPin = useCallback(
    async (userId: UserId, pin: string) => {
      const found = USERS.find((u) => u.id === userId);
      if (!found) return false;
      // Never overwrite an existing PIN (prevents hijacking a set account).
      if (stateRef.current.pins?.[userId]) return false;
      const hash = await hashPin(pin);
      commit((c) => ({ ...c, pins: { ...c.pins, [userId]: hash } }));
      setSession(found.id);
      setUser(found);
      return true;
    },
    [commit],
  );

  const upsertLog = useCallback(
    async (input: UpsertInput) => {
      if (!user) throw new Error('Not logged in');
      // Integrity: you can only ever log for the current day (no backdating).
      const date = todayKey();
      const cur = stateRef.current;
      const existing = cur.logs.find((l) => l.userId === user.id && l.date === date);
      const now = new Date().toISOString();

      // Anti-padding: reject duplicate LeetCode numbers in the same submission.
      const seen = new Set<string>();
      for (const p of input.problems) {
        const n = p.number.trim();
        if (!n) continue;
        if (seen.has(n)) throw new Error(`Problem #${n} is listed twice — each proof must be unique.`);
        seen.add(n);
      }

      const { easy, medium, hard } = countsFromProblems(input.problems);
      const total = easy + medium + hard;
      const goalJustMet =
        total >= 5 && (!existing || existing.easy + existing.medium + existing.hard < 5);

      let log: DailyLog;
      let isNew = false;
      let nextLogs: DailyLog[];

      if (existing) {
        log = {
          ...existing,
          easy,
          medium,
          hard,
          problems: input.problems,
          notes: input.notes,
          updatedAt: now,
        };
        nextLogs = cur.logs.map((l) => (l.id === existing.id ? log : l));
      } else {
        isNew = true;
        log = {
          id: `${user.id}-${date}-${Date.now()}`,
          userId: user.id,
          date,
          easy,
          medium,
          hard,
          problems: input.problems,
          notes: input.notes,
          createdAt: now,
          updatedAt: now,
        };
        nextLogs = [...cur.logs, log];
      }

      commit((c) => {
        const tombstones = { ...c.tombstones };
        delete tombstones[`${user.id}|${date}`];
        return { ...c, logs: nextLogs, tombstones };
      });
      return { log, isNew, goalJustMet };
    },
    [user, commit],
  );

  const deleteLog = useCallback(
    (logId: string) => {
      if (!user) return;
      const target = stateRef.current.logs.find((l) => l.id === logId);
      if (!target) return;
      // Integrity: only your own log, and only for the current (still-open) day.
      if (target.userId !== user.id) return;
      if (target.date !== todayKey()) return;
      commit((c) => {
        const tombstones = { ...c.tombstones };
        tombstones[`${target.userId}|${target.date}`] = new Date().toISOString();
        return {
          ...c,
          logs: c.logs.filter((l) => l.id !== logId),
          tombstones,
        };
      });
    },
    [user, commit],
  );

  const resetAll = useCallback(() => {
    const fresh = emptyState();
    fresh.version = (stateRef.current.version || 0) + 1;
    void overwrite(fresh);
  }, [overwrite]);

  const updateDisplayName = useCallback(
    (userId: UserId, name: string) => {
      if (!user || userId !== user.id) return; // you can only rename yourself
      commit((c) => ({
        ...c,
        displayNames: { ...c.displayNames, [userId]: name.trim() || c.displayNames[userId] },
      }));
    },
    [user, commit],
  );

  const markPaid = useCallback(
    (userId: UserId) => {
      if (!user || userId !== user.id) return; // you can only clear your own tab
      const tab = computePayTab(stateRef.current, userId);
      if (tab.owesOutings <= 0) return;
      commit((c) => ({
        ...c,
        paymentsCleared: {
          ...c.paymentsCleared,
          [userId]: (c.paymentsCleared[userId] ?? 0) + 1,
        },
        paymentHistory: [
          { id: `pay-${userId}-${Date.now()}`, userId, paidAt: new Date().toISOString(), note: '' },
          ...c.paymentHistory,
        ].slice(0, 100),
      }));
    },
    [user, commit],
  );

  const undoPayment = useCallback(
    (userId: UserId) => {
      if (!user || userId !== user.id) return; // you can only adjust your own tab
      const cleared = stateRef.current.paymentsCleared[userId] ?? 0;
      if (cleared <= 0) return;
      commit((c) => {
        const history = [...c.paymentHistory];
        const idx = history.findIndex((p) => p.userId === userId);
        if (idx >= 0) history.splice(idx, 1);
        return {
          ...c,
          paymentsCleared: { ...c.paymentsCleared, [userId]: cleared - 1 },
          paymentHistory: history,
        };
      });
    },
    [user, commit],
  );

  const value = useMemo(
    () => ({
      ready,
      user,
      state,
      syncStatus,
      online,
      hasPin,
      createPin,
      loginWithPin,
      logout,
      refresh,
      upsertLog,
      deleteLog,
      resetAll,
      updateDisplayName,
      markPaid,
      undoPayment,
    }),
    [
      ready,
      user,
      state,
      syncStatus,
      online,
      hasPin,
      createPin,
      loginWithPin,
      logout,
      refresh,
      upsertLog,
      deleteLog,
      resetAll,
      updateDisplayName,
      markPaid,
      undoPayment,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
