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

interface UpsertInput {
  problems: Problem[];
  notes: string;
  date?: string;
}

interface AppContextValue {
  ready: boolean;
  user: User | null;
  state: CompetitionState;
  syncStatus: SyncStatus;
  online: boolean;
  loginAs: (userId: UserId) => boolean;
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
    if (syncingRef.current) {
      pendingRef.current = true;
      return;
    }
    syncingRef.current = true;
    setSyncStatus('syncing');
    try {
      let remote: CompetitionState | null = null;
      try {
        remote = await fetchRemote();
      } catch {
        remote = null;
      }

      const local = stateRef.current;
      const merged = remote ? mergeStates(remote, local) : local;

      if (signature(merged) !== signature(local)) {
        applyState(merged);
      }

      const needPush = remoteConfigured() && (!remote || signature(merged) !== signature(remote));
      if (needPush) {
        await saveRemote(merged);
      }

      dirtyRef.current = false;
      setSyncStatus('saved');
      setOnline(true);
    } catch {
      dirtyRef.current = true;
      setSyncStatus('error');
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

  // Poll for the other player's updates
  useEffect(() => {
    const id = window.setInterval(() => void runSync(), 8000);
    return () => window.clearInterval(id);
  }, [runSync]);

  // Sync on focus / reconnect
  useEffect(() => {
    const onFocus = () => void runSync();
    const onOnline = () => {
      setOnline(true);
      void runSync();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [runSync]);

  const loginAs = useCallback((userId: UserId) => {
    const found = USERS.find((u) => u.id === userId);
    if (!found) return false;
    setSession(found.id);
    setUser(found);
    return true;
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    setUser(null);
  }, []);

  const refresh = useCallback(() => void runSync(), [runSync]);

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

  const upsertLog = useCallback(
    async (input: UpsertInput) => {
      if (!user) throw new Error('Not logged in');
      const date = input.date ?? todayKey();
      const cur = stateRef.current;
      const existing = cur.logs.find((l) => l.userId === user.id && l.date === date);
      const now = new Date().toISOString();
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

      commit((c) => ({ ...c, logs: nextLogs }));
      return { log, isNew, goalJustMet };
    },
    [user, commit],
  );

  const deleteLog = useCallback(
    (logId: string) => {
      commit((c) => ({ ...c, logs: c.logs.filter((l) => l.id !== logId) }));
    },
    [commit],
  );

  const resetAll = useCallback(() => {
    const fresh = emptyState();
    fresh.version = (stateRef.current.version || 0) + 1;
    void overwrite(fresh);
  }, [overwrite]);

  const updateDisplayName = useCallback(
    (userId: UserId, name: string) => {
      commit((c) => ({
        ...c,
        displayNames: { ...c.displayNames, [userId]: name.trim() || c.displayNames[userId] },
      }));
    },
    [commit],
  );

  const markPaid = useCallback(
    (userId: UserId) => {
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
    [commit],
  );

  const undoPayment = useCallback(
    (userId: UserId) => {
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
    [commit],
  );

  const value = useMemo(
    () => ({
      ready,
      user,
      state,
      syncStatus,
      online,
      loginAs,
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
      loginAs,
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
