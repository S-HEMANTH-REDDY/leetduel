export type UserId = 'hemanth' | 'abhiram';

export interface User {
  id: UserId;
  displayName: string;
  password: string;
  isAdmin: boolean;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

/** A single solved problem, logged as proof. */
export interface Problem {
  id: string;
  number: string; // LeetCode problem number, e.g. "1"
  title: string; // e.g. "Two Sum"
  difficulty: Difficulty;
}

export interface DailyLog {
  id: string;
  userId: UserId;
  date: string; // YYYY-MM-DD
  easy: number;
  medium: number;
  hard: number;
  /** Proof list — required going forward; may be empty for legacy logs. */
  problems: Problem[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitionState {
  version: number;
  createdAt: string;
  /** Any log older than this instant is dropped on merge (used by Reset). */
  resetAt: string;
  /** Deleted day markers: key "userId|date" -> ISO deletedAt. */
  tombstones: Record<string, string>;
  logs: DailyLog[];
  displayNames: Record<UserId, string>;
  /** How many times each person has already paid the outing bill. */
  paymentsCleared: Record<UserId, number>;
  /** Optional notes for each payment click (most recent first). */
  paymentHistory: Array<{
    id: string;
    userId: UserId;
    paidAt: string;
    note: string;
  }>;
}

export interface UserStats {
  userId: UserId;
  displayName: string;
  todayScore: number;
  todayProblems: number;
  todayGoalMet: boolean | null; // null = not logged today
  totalScore: number;
  totalEasy: number;
  totalMedium: number;
  totalHard: number;
  totalProblems: number;
  currentStreak: number;
  longestStreak: number;
  codingDays: number;
  avgProblemsPerDay: number;
  missedDays: number;
  timesPaid: number;
  owesOutings: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

export const USERS: User[] = [
  {
    id: 'hemanth',
    displayName: 'Hemanth',
    password: 'duel9pm',
    isAdmin: true,
  },
  {
    id: 'abhiram',
    displayName: 'Abhiram',
    password: 'duel9pm',
    isAdmin: true,
  },
];

export const DAILY_GOAL = 5;
export const POINTS = { easy: 1, medium: 2, hard: 3 } as const;