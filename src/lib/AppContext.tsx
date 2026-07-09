import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  USERS,
  type CompetitionState,
  type DailyLog,
  type User,
  type UserId,
} from './types';
import { getSession, loadState, resetCompetition, saveState, setSession } from './storage';
import { computePayTab, todayKey } from './scoring';

interface AppContextValue {
  ready: boolean;
  user: User | null;
  state: CompetitionState;
  error: string | null;
  loginAs: (userId: UserId) => boolean;
  logout: () => void;
  refresh: () => Promise<void>;
  upsertLog: (input: {
    easy: number;
    medium: number;
    hard: number;
    notes: string;
    date?: string;
  }) => Promise<{ log: DailyLog; isNew: boolean; goalJustMet: boolean }>;
  deleteLog: (logId: string) => Promise<void>;
  resetAll: () => Promise<void>;
  updateDisplayName: (userId: UserId, name: string) => Promise<void>;
  markPaid: (userId: UserId, note?: string) => Promise<void>;
  undoPayment: (userId: UserId) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<CompetitionState>(() => ({
    version: 0,
    createdAt: new Date().toISOString(),
    logs: [],
    displayNames: { hemanth: 'Hemanth', friend: 'Friend' },
    paymentsCleared: { hemanth: 0, friend: 0 },
    paymentHistory: [],
  }));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await loadState();
      setState(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    (async () => {
      const session = getSession();
      if (session) {
        const found = USERS.find((u) => u.id === session) ?? null;
        setUser(found);
      }
      await refresh();
      setReady(true);
    })();
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => window.clearInterval(id);
  }, [refresh]);

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

  const upsertLog = useCallback(
    async (input: {
      easy: number;
      medium: number;
      hard: number;
      notes: string;
      date?: string;
    }) => {
      if (!user) throw new Error('Not logged in');
      const date = input.date ?? todayKey();
      const existing = state.logs.find((l) => l.userId === user.id && l.date === date);
      const now = new Date().toISOString();
      const problems = input.easy + input.medium + input.hard;
      const goalJustMet =
        problems >= 5 && (!existing || existing.easy + existing.medium + existing.hard < 5);

      let nextLogs: DailyLog[];
      let log: DailyLog;
      let isNew = false;

      if (existing) {
        log = {
          ...existing,
          easy: input.easy,
          medium: input.medium,
          hard: input.hard,
          notes: input.notes,
          updatedAt: now,
        };
        nextLogs = state.logs.map((l) => (l.id === existing.id ? log : l));
      } else {
        isNew = true;
        log = {
          id: `${user.id}-${date}-${Date.now()}`,
          userId: user.id,
          date,
          easy: input.easy,
          medium: input.medium,
          hard: input.hard,
          notes: input.notes,
          createdAt: now,
          updatedAt: now,
        };
        nextLogs = [...state.logs, log];
      }

      const next = await saveState({ ...state, logs: nextLogs });
      setState(next);
      return { log, isNew, goalJustMet };
    },
    [state, user],
  );

  const deleteLog = useCallback(
    async (logId: string) => {
      const next = await saveState({
        ...state,
        logs: state.logs.filter((l) => l.id !== logId),
      });
      setState(next);
    },
    [state],
  );

  const resetAll = useCallback(async () => {
    const next = await resetCompetition();
    setState(next);
  }, []);

  const updateDisplayName = useCallback(
    async (userId: UserId, name: string) => {
      const next = await saveState({
        ...state,
        displayNames: {
          ...state.displayNames,
          [userId]: name.trim() || state.displayNames[userId],
        },
      });
      setState(next);
    },
    [state],
  );

  const markPaid = useCallback(
    async (userId: UserId, note = '') => {
      const tab = computePayTab(state, userId);
      if (tab.owesOutings <= 0) throw new Error('Nothing left to pay for');
      const next = await saveState({
        ...state,
        paymentsCleared: {
          ...state.paymentsCleared,
          [userId]: (state.paymentsCleared[userId] ?? 0) + 1,
        },
        paymentHistory: [
          {
            id: `pay-${userId}-${Date.now()}`,
            userId,
            paidAt: new Date().toISOString(),
            note,
          },
          ...state.paymentHistory,
        ].slice(0, 50),
      });
      setState(next);
    },
    [state],
  );

  const undoPayment = useCallback(
    async (userId: UserId) => {
      const cleared = state.paymentsCleared[userId] ?? 0;
      if (cleared <= 0) throw new Error('No payments to undo');
      const history = [...state.paymentHistory];
      const idx = history.findIndex((p) => p.userId === userId);
      if (idx >= 0) history.splice(idx, 1);
      const next = await saveState({
        ...state,
        paymentsCleared: {
          ...state.paymentsCleared,
          [userId]: cleared - 1,
        },
        paymentHistory: history,
      });
      setState(next);
    },
    [state],
  );

  const value = useMemo(
    () => ({
      ready,
      user,
      state,
      error,
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
      error,
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
