import {
  eachDayOfInterval,
  format,
  parseISO,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
} from 'date-fns';
import {
  DAILY_GOAL,
  POINTS,
  type CompetitionState,
  type DailyLog,
  type UserId,
  type UserStats,
  type Achievement,
} from './types';

export function todayKey(date = new Date()): string {
  return format(date, 'yyyy-MM-dd');
}

export function calcPoints(easy: number, medium: number, hard: number): number {
  return easy * POINTS.easy + medium * POINTS.medium + hard * POINTS.hard;
}

export function calcProblems(easy: number, medium: number, hard: number): number {
  return easy + medium + hard;
}

export function goalMet(log: DailyLog): boolean {
  return calcProblems(log.easy, log.medium, log.hard) >= DAILY_GOAL;
}

function logsForUser(state: CompetitionState, userId: UserId): DailyLog[] {
  return state.logs
    .filter((l) => l.userId === userId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function logByDate(logs: DailyLog[]): Map<string, DailyLog> {
  const map = new Map<string, DailyLog>();
  for (const log of logs) map.set(log.date, log);
  return map;
}

/** Streak counts consecutive goal-met days ending at `asOf` (or yesterday if today not logged). */
export function computeStreaks(
  logs: DailyLog[],
  asOf = new Date(),
): { current: number; longest: number } {
  const byDate = logByDate(logs);
  const asOfKey = todayKey(asOf);

  let longest = 0;
  let run = 0;

  // Walk from earliest to latest for longest
  if (logs.length > 0) {
    const first = parseISO(logs[0].date);
    const last = parseISO(logs[logs.length - 1].date);
    const days = eachDayOfInterval({ start: first, end: last });
    for (const day of days) {
      const key = format(day, 'yyyy-MM-dd');
      const log = byDate.get(key);
      if (log && goalMet(log)) {
        run += 1;
        longest = Math.max(longest, run);
      } else {
        run = 0;
      }
    }
  }

  // Current streak: walk backwards from today (or yesterday if today missing/failed)
  let current = 0;
  let cursor = asOf;
  const todayLog = byDate.get(asOfKey);

  if (!todayLog) {
    cursor = subDays(asOf, 1);
  } else if (!goalMet(todayLog)) {
    return { current: 0, longest };
  }

  for (let i = 0; i < 400; i++) {
    const key = todayKey(cursor);
    const log = byDate.get(key);
    if (log && goalMet(log)) {
      current += 1;
      cursor = subDays(cursor, 1);
    } else {
      break;
    }
  }

  longest = Math.max(longest, current);
  return { current, longest };
}

/** Missed days from competition start through yesterday (today still in progress). */
export function countMissedDays(
  state: CompetitionState,
  userId: UserId,
  asOf = new Date(),
): { missed: number; missedDates: string[] } {
  const logs = logByDate(logsForUser(state, userId));
  const start = parseISO(state.createdAt.slice(0, 10));
  const end = subDays(asOf, 1); // yesterday — today isn't closed yet

  if (end < start) return { missed: 0, missedDates: [] };

  const missedDates: string[] = [];
  for (const day of eachDayOfInterval({ start, end })) {
    const key = format(day, 'yyyy-MM-dd');
    const log = logs.get(key);
    if (!log || !goalMet(log)) missedDates.push(key);
  }
  return { missed: missedDates.length, missedDates };
}

export function computePayTab(state: CompetitionState, userId: UserId, asOf = new Date()) {
  const { missed, missedDates } = countMissedDays(state, userId, asOf);
  const timesPaid = state.paymentsCleared?.[userId] ?? 0;
  const owesOutings = Math.max(0, missed - timesPaid);
  return { missed, missedDates, timesPaid, owesOutings };
}

export function computeUserStats(
  state: CompetitionState,
  userId: UserId,
  asOf = new Date(),
): UserStats {
  const logs = logsForUser(state, userId);
  const today = todayKey(asOf);
  const todayLog = logs.find((l) => l.date === today);

  let totalEasy = 0;
  let totalMedium = 0;
  let totalHard = 0;
  let totalScore = 0;

  for (const log of logs) {
    totalEasy += log.easy;
    totalMedium += log.medium;
    totalHard += log.hard;
    totalScore += calcPoints(log.easy, log.medium, log.hard);
  }

  const totalProblems = totalEasy + totalMedium + totalHard;
  const codingDays = logs.length;
  const streaks = computeStreaks(logs, asOf);
  const pay = computePayTab(state, userId, asOf);

  return {
    userId,
    displayName: state.displayNames[userId],
    todayScore: todayLog
      ? calcPoints(todayLog.easy, todayLog.medium, todayLog.hard)
      : 0,
    todayProblems: todayLog
      ? calcProblems(todayLog.easy, todayLog.medium, todayLog.hard)
      : 0,
    todayGoalMet: todayLog ? goalMet(todayLog) : null,
    totalScore,
    totalEasy,
    totalMedium,
    totalHard,
    totalProblems,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    codingDays,
    avgProblemsPerDay: codingDays ? totalProblems / codingDays : 0,
    missedDays: pay.missed,
    timesPaid: pay.timesPaid,
    owesOutings: pay.owesOutings,
  };
}

export function computeLeaderboard(state: CompetitionState, asOf = new Date()) {
  const ids: UserId[] = ['hemanth', 'friend'];
  const stats = ids.map((id) => computeUserStats(state, id, asOf));
  stats.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
    return b.totalProblems - a.totalProblems;
  });
  return stats;
}

export function getAchievements(stats: UserStats): Achievement[] {
  const defs: Omit<Achievement, 'unlocked'>[] = [
    {
      id: 'first-log',
      title: 'First Blood',
      description: 'Log your first day',
      icon: '🎯',
    },
    {
      id: 'goal-1',
      title: 'On Target',
      description: 'Hit the 5-problem daily goal',
      icon: '✅',
    },
    {
      id: 'streak-3',
      title: 'Warming Up',
      description: '3-day streak',
      icon: '🔥',
    },
    {
      id: 'streak-7',
      title: 'Week Warrior',
      description: '7-day streak',
      icon: '⚡',
    },
    {
      id: 'streak-30',
      title: 'Unstoppable',
      description: '30-day streak',
      icon: '💎',
    },
    {
      id: 'problems-50',
      title: 'Half Century',
      description: '50 problems solved',
      icon: '5️⃣0️⃣',
    },
    {
      id: 'problems-100',
      title: 'Century Club',
      description: '100 problems solved',
      icon: '💯',
    },
    {
      id: 'problems-500',
      title: 'Grinder',
      description: '500 problems solved',
      icon: '🏆',
    },
    {
      id: 'hard-10',
      title: 'Hard Mode',
      description: '10 hard problems',
      icon: '💪',
    },
    {
      id: 'score-100',
      title: 'Point Collector',
      description: '100 total points',
      icon: '⭐',
    },
  ];

  return defs.map((d) => {
    let unlocked = false;
    switch (d.id) {
      case 'first-log':
        unlocked = stats.codingDays >= 1;
        break;
      case 'goal-1':
        unlocked = stats.todayGoalMet === true || stats.currentStreak >= 1 || stats.longestStreak >= 1;
        break;
      case 'streak-3':
        unlocked = stats.longestStreak >= 3;
        break;
      case 'streak-7':
        unlocked = stats.longestStreak >= 7;
        break;
      case 'streak-30':
        unlocked = stats.longestStreak >= 30;
        break;
      case 'problems-50':
        unlocked = stats.totalProblems >= 50;
        break;
      case 'problems-100':
        unlocked = stats.totalProblems >= 100;
        break;
      case 'problems-500':
        unlocked = stats.totalProblems >= 500;
        break;
      case 'hard-10':
        unlocked = stats.totalHard >= 10;
        break;
      case 'score-100':
        unlocked = stats.totalScore >= 100;
        break;
    }
    return { ...d, unlocked };
  });
}

export function dailySeries(state: CompetitionState, userId: UserId, days = 30) {
  const logs = logByDate(logsForUser(state, userId));
  const end = new Date();
  const start = subDays(end, days - 1);
  return eachDayOfInterval({ start, end }).map((day) => {
    const key = format(day, 'yyyy-MM-dd');
    const log = logs.get(key);
    const problems = log ? calcProblems(log.easy, log.medium, log.hard) : 0;
    return {
      date: key,
      label: format(day, 'MMM d'),
      problems,
      points: log ? calcPoints(log.easy, log.medium, log.hard) : 0,
      goalMet: log ? goalMet(log) : false,
      logged: Boolean(log),
    };
  });
}

export function heatmapData(state: CompetitionState, userId: UserId, days = 119) {
  return dailySeries(state, userId, days).map((d) => ({
    date: d.date,
    count: d.problems,
    level: !d.logged ? 0 : d.problems >= 8 ? 4 : d.problems >= 5 ? 3 : d.problems >= 3 ? 2 : 1,
  }));
}

export function periodSummary(
  state: CompetitionState,
  userId: UserId,
  period: 'week' | 'month',
  asOf = new Date(),
) {
  const range =
    period === 'week'
      ? { start: startOfWeek(asOf, { weekStartsOn: 1 }), end: endOfWeek(asOf, { weekStartsOn: 1 }) }
      : { start: startOfMonth(asOf), end: endOfMonth(asOf) };

  const logs = logsForUser(state, userId).filter((l) =>
    isWithinInterval(parseISO(l.date), range),
  );

  let easy = 0;
  let medium = 0;
  let hard = 0;
  let points = 0;
  let goalsHit = 0;

  for (const log of logs) {
    easy += log.easy;
    medium += log.medium;
    hard += log.hard;
    points += calcPoints(log.easy, log.medium, log.hard);
    if (goalMet(log)) goalsHit += 1;
  }

  return {
    easy,
    medium,
    hard,
    problems: easy + medium + hard,
    points,
    daysLogged: logs.length,
    goalsHit,
  };
}

export function exportCsv(state: CompetitionState): string {
  const header = 'date,user,easy,medium,hard,points,problems,goal_met,notes';
  const rows = [...state.logs]
    .sort((a, b) => a.date.localeCompare(b.date) || a.userId.localeCompare(b.userId))
    .map((l) => {
      const points = calcPoints(l.easy, l.medium, l.hard);
      const problems = calcProblems(l.easy, l.medium, l.hard);
      const notes = `"${(l.notes || '').replace(/"/g, '""')}"`;
      return [
        l.date,
        state.displayNames[l.userId],
        l.easy,
        l.medium,
        l.hard,
        points,
        problems,
        goalMet(l) ? 'yes' : 'no',
        notes,
      ].join(',');
    });
  return [header, ...rows].join('\n');
}