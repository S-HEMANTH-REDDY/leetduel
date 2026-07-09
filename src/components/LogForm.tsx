import { useEffect, useMemo, useState, type FormEvent } from 'react';
import confetti from 'canvas-confetti';
import { useApp } from '../lib/AppContext';
import {
  calcPoints,
  countsFromProblems,
  formatCountdown,
  msUntilDeadline,
  todayKey,
} from '../lib/scoring';
import { DAILY_GOAL, type Difficulty, type Problem } from '../lib/types';

function blankRow(): Problem {
  return {
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    number: '',
    title: '',
    difficulty: 'medium',
  };
}

const DIFFS: { key: Difficulty; label: string }[] = [
  { key: 'easy', label: 'E' },
  { key: 'medium', label: 'M' },
  { key: 'hard', label: 'H' },
];

export function LogForm({ onGoalMet }: { onGoalMet?: () => void }) {
  const { user, state, upsertLog } = useApp();
  const today = todayKey();
  const existing = useMemo(
    () => state.logs.find((l) => l.userId === user?.id && l.date === today),
    [state.logs, user?.id, today],
  );

  const [rows, setRows] = useState<Problem[]>([blankRow()]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [remaining, setRemaining] = useState(msUntilDeadline());

  useEffect(() => {
    const id = window.setInterval(() => setRemaining(msUntilDeadline()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (existing && existing.problems.length > 0) {
      setRows(existing.problems.map((p) => ({ ...p })));
      setNotes(existing.notes);
    } else if (existing) {
      // legacy log without proof list — start fresh but keep notes
      setRows([blankRow()]);
      setNotes(existing.notes);
    } else {
      setRows([blankRow()]);
      setNotes('');
    }
  }, [existing]);

  const filled = rows.filter((r) => r.title.trim() || r.number.trim());
  const counts = countsFromProblems(filled);
  const problems = counts.easy + counts.medium + counts.hard;
  const points = calcPoints(counts.easy, counts.medium, counts.hard);
  const goalOk = problems >= DAILY_GOAL;

  function updateRow(id: string, patch: Partial<Problem>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRow(id: string) {
    setRows((rs) => (rs.length <= 1 ? [blankRow()] : rs.filter((r) => r.id !== id)));
  }
  function addRow() {
    setRows((rs) => [...rs, blankRow()]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = rows
      .map((r) => ({ ...r, number: r.number.trim(), title: r.title.trim() }))
      .filter((r) => r.title || r.number);

    if (cleaned.length === 0) {
      setMessage('Add at least one problem with its number and title as proof.');
      return;
    }
    const missingTitle = cleaned.some((r) => !r.title);
    const missingNumber = cleaned.some((r) => !r.number);
    if (missingTitle || missingNumber) {
      setMessage('Each problem needs both a LeetCode number and a title (proof).');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const result = await upsertLog({ problems: cleaned, notes });
      setMessage(result.isNew ? 'Logged for today. ✅' : 'Updated today’s log. ✅');
      if (result.goalJustMet) {
        confetti({
          particleCount: 140,
          spread: 75,
          origin: { y: 0.65 },
          colors: ['#3ecf8e', '#f5c542', '#6ea8fe'],
        });
        onGoalMet?.();
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const urgent = remaining < 2 * 60 * 60 * 1000; // under 2h

  return (
    <form className="panel log-form" onSubmit={onSubmit}>
      <div className="panel-head">
        <div>
          <h2>Today’s log</h2>
          <p className="muted">
            Log each problem with its LeetCode number + title as proof. Goal: {DAILY_GOAL}+ per day.
          </p>
        </div>
        <div className={`goal-pill ${goalOk ? 'ok' : 'miss'}`}>
          {goalOk ? '✅ Goal met' : `❌ ${problems}/${DAILY_GOAL}`}
        </div>
      </div>

      <div className={`deadline ${urgent ? 'urgent' : ''}`}>
        <span className="deadline-label">⏳ Time left to log today</span>
        <span className="deadline-clock">{formatCountdown(remaining)}</span>
        <span className="deadline-note muted">
          Log before 11:59:59 PM — miss it and the day is lost (you owe the outing bill).
        </span>
      </div>

      <div className="proof-list">
        <div className="proof-head">
          <span className="col-num">#</span>
          <span className="col-title">Problem title</span>
          <span className="col-diff">Difficulty</span>
          <span className="col-x" />
        </div>
        {rows.map((row, i) => (
          <div className="proof-row" key={row.id}>
            <input
              className="col-num"
              inputMode="numeric"
              placeholder="No."
              value={row.number}
              onChange={(e) => updateRow(row.id, { number: e.target.value.replace(/[^0-9]/g, '') })}
            />
            <input
              className="col-title"
              placeholder={i === 0 ? 'e.g. Two Sum' : 'Problem title'}
              value={row.title}
              onChange={(e) => updateRow(row.id, { title: e.target.value })}
            />
            <div className="col-diff diff-toggle">
              {DIFFS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  className={`diff-btn ${d.key} ${row.difficulty === d.key ? 'active' : ''}`}
                  onClick={() => updateRow(row.id, { difficulty: d.key })}
                  aria-label={d.key}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="col-x remove-row"
              onClick={() => removeRow(row.id)}
              aria-label="Remove problem"
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn ghost add-row" onClick={addRow}>
          + Add problem
        </button>
      </div>

      <label>
        Notes <span className="muted">(optional)</span>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Approach, topics, anything…"
        />
      </label>

      <div className="log-footer">
        <div className="muted">
          <strong>{problems}</strong> problems (E {counts.easy} · M {counts.medium} · H {counts.hard})
          · <strong>{points}</strong> pts{existing ? ' · editing today' : ''}
        </div>
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : existing ? 'Update log' : 'Submit log'}
        </button>
      </div>
      {message && <p className="form-msg">{message}</p>}
    </form>
  );
}
