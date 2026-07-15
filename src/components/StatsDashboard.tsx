import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Pie,
  PieChart,
  Cell,
} from 'recharts';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
} from 'date-fns';
import { useApp } from '../lib/AppContext';
import {
  computeUserStats,
  dailySeries,
  getAchievements,
  heatmapData,
  periodSummary,
  goalMet,
} from '../lib/scoring';
import type { UserId } from '../lib/types';

const PIE_COLORS = ['#34c759', '#ff9f0a', '#ff3b30'];
const AXIS = '#86868b';
const GRID = 'rgba(0,0,0,0.07)';
const TOOLTIP_STYLE = {
  background: '#ffffff',
  border: '1px solid rgba(0,0,0,0.1)',
  borderRadius: 12,
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
  color: '#1d1d1f',
} as const;

export function StatsDashboard() {
  const { state, user } = useApp();
  const [focus, setFocus] = useState<UserId>(user?.id ?? 'hemanth');
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const stats = useMemo(() => computeUserStats(state, focus), [state, focus]);
  const series = useMemo(() => dailySeries(state, focus, 14), [state, focus]);
  const heat = useMemo(() => heatmapData(state, focus, 119), [state, focus]);
  const week = useMemo(() => periodSummary(state, focus, 'week'), [state, focus]);
  const monthSum = useMemo(() => periodSummary(state, focus, 'month'), [state, focus]);
  const achievements = useMemo(() => getAchievements(stats), [stats]);

  const pie = [
    { name: 'Easy', value: stats.totalEasy },
    { name: 'Medium', value: stats.totalMedium },
    { name: 'Hard', value: stats.totalHard },
  ].filter((d) => d.value > 0);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const days = eachDayOfInterval({ start, end });
    const byDate = new Map(
      state.logs.filter((l) => l.userId === focus).map((l) => [l.date, l]),
    );
    const pad = (start.getDay() + 6) % 7; // Monday-first
    return { pad, days, byDate };
  }, [month, state.logs, focus]);

  return (
    <section className="stats">
      <div className="panel-head stats-head">
        <div>
          <h2>Statistics</h2>
          <p className="muted">Calendar, heatmap, trends, and achievements</p>
        </div>
        <div className="seg">
          {(['hemanth', 'abhiram'] as UserId[]).map((id) => (
            <button
              key={id}
              type="button"
              className={focus === id ? 'active' : ''}
              onClick={() => setFocus(id)}
            >
              {state.displayNames[id]}
            </button>
          ))}
        </div>
      </div>

      <div className="stat-cards">
        <StatCard label="Total points" value={stats.totalScore} />
        <StatCard label="Problems" value={stats.totalProblems} />
        <StatCard label="Coding days" value={stats.codingDays} />
        <StatCard label="Avg / day" value={stats.avgProblemsPerDay.toFixed(1)} />
        <StatCard label="Current streak" value={`${stats.currentStreak}🔥`} />
        <StatCard label="Longest streak" value={stats.longestStreak} />
      </div>

      <div className="stats-grid">
        <div className="panel">
          <div className="panel-head">
            <h3>Calendar</h3>
            <div className="month-nav">
              <button type="button" onClick={() => setMonth((m) => subMonths(m, 1))}>
                ‹
              </button>
              <span>{format(month, 'MMMM yyyy')}</span>
              <button
                type="button"
                onClick={() => setMonth((m) => addMonths(m, 1))}
                disabled={isSameMonth(month, new Date())}
              >
                ›
              </button>
            </div>
          </div>
          <div className="cal-grid">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="cal-dow">
                {d}
              </div>
            ))}
            {Array.from({ length: calendarDays.pad }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {calendarDays.days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const log = calendarDays.byDate.get(key);
              const status = !log ? 'empty' : goalMet(log) ? 'ok' : 'miss';
              return (
                <div key={key} className={`cal-day ${status}`} title={key}>
                  <span>{format(day, 'd')}</span>
                  {status === 'ok' && <em>✅</em>}
                  {status === 'miss' && <em>❌</em>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Contribution heatmap</h3>
            <p className="muted">Last ~17 weeks</p>
          </div>
          <div className="heatmap">
            {heat.map((cell) => (
              <div
                key={cell.date}
                className={`heat-cell l${cell.level}`}
                title={`${cell.date}: ${cell.count} problems`}
              />
            ))}
          </div>
          <div className="heat-legend muted">
            Less <span className="heat-cell l0" /> <span className="heat-cell l1" />
            <span className="heat-cell l2" /> <span className="heat-cell l3" />
            <span className="heat-cell l4" /> More
          </div>
        </div>

        <div className="panel chart-panel">
          <div className="panel-head">
            <h3>Daily progress</h3>
            <p className="muted">Last 14 days</p>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="label" stroke={AXIS} fontSize={11} />
                <YAxis stroke={AXIS} fontSize={11} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="problems" fill="#0071e3" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel chart-panel">
          <div className="panel-head">
            <h3>Difficulty mix</h3>
            <p className="muted">
              E {stats.totalEasy} · M {stats.totalMedium} · H {stats.totalHard}
            </p>
          </div>
          <div className="chart-box pie-box">
            {pie.length === 0 ? (
              <p className="muted center">No solves yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                    {pie.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>This week</h3>
          </div>
          <ul className="summary-list">
            <li>
              <span>Problems</span>
              <strong>{week.problems}</strong>
            </li>
            <li>
              <span>Points</span>
              <strong>{week.points}</strong>
            </li>
            <li>
              <span>Days logged</span>
              <strong>{week.daysLogged}</strong>
            </li>
            <li>
              <span>Goals hit</span>
              <strong>{week.goalsHit}</strong>
            </li>
          </ul>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>This month</h3>
          </div>
          <ul className="summary-list">
            <li>
              <span>Problems</span>
              <strong>{monthSum.problems}</strong>
            </li>
            <li>
              <span>Points</span>
              <strong>{monthSum.points}</strong>
            </li>
            <li>
              <span>Days logged</span>
              <strong>{monthSum.daysLogged}</strong>
            </li>
            <li>
              <span>Goals hit</span>
              <strong>{monthSum.goalsHit}</strong>
            </li>
          </ul>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Achievements</h3>
          <p className="muted">
            {achievements.filter((a) => a.unlocked).length}/{achievements.length} unlocked
          </p>
        </div>
        <div className="achievements">
          {achievements.map((a) => (
            <div key={a.id} className={`achievement ${a.unlocked ? 'on' : 'off'}`}>
              <span className="ach-icon">{a.icon}</span>
              <div>
                <strong>{a.title}</strong>
                <p>{a.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}