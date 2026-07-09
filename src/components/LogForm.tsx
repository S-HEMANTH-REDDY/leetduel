import { useEffect, useMemo, useState, type FormEvent } from 'react';
import confetti from 'canvas-confetti';
import { useApp } from '../lib/AppContext';
import { calcPoints, calcProblems, todayKey } from '../lib/scoring';
import { DAILY_GOAL } from '../lib/types';

export function LogForm({ onGoalMet }: { onGoalMet?: () => void }) {
  const { user, state, upsertLog } = useApp();
  const today = todayKey();
  const existing = useMemo(
    () => state.logs.find((l) => l.userId === user?.id && l.date === today),
    [state.logs, user?.id, today],
  );

  const [easy, setEasy] = useState(0);
  const [medium, setMedium] = useState(0);
  const [hard, setHard] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (existing) {
      setEasy(existing.easy);
      setMedium(existing.medium);
      setHard(existing.hard);
      setNotes(existing.notes);
    } else {
      setEasy(0);
      setMedium(0);
      setHard(0);
      setNotes('');
    }
  }, [existing]);

  const problems = calcProblems(easy, medium, hard);
  const points = calcPoints(easy, medium, hard);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (problems === 0) {
      setMessage('Add at least one problem.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const result = await upsertLog({ easy, medium, hard, notes });
      setMessage(result.isNew ? 'Logged for today.' : 'Updated today’s log.');
      if (result.goalJustMet) {
        confetti({
          particleCount: 120,
          spread: 70,
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

  return (
    <form className="panel log-form" onSubmit={onSubmit}>
      <div className="panel-head">
        <div>
          <h2>Tonight’s log</h2>
          <p className="muted">
            Takes under 15 seconds. Goal: {DAILY_GOAL}+ problems (any Easy/Medium/Hard mix).
          </p>
        </div>
        <div className={`goal-pill ${problems >= DAILY_GOAL ? 'ok' : 'miss'}`}>
          {problems >= DAILY_GOAL ? '✅ Goal met' : `❌ ${problems}/${DAILY_GOAL}`}
        </div>
      </div>

      <div className="counter-grid">
        <Counter label="Easy" value={easy} onChange={setEasy} accent="easy" hint="+1 pt" />
        <Counter label="Medium" value={medium} onChange={setMedium} accent="medium" hint="+2 pts" />
        <Counter label="Hard" value={hard} onChange={setHard} accent="hard" hint="+3 pts" />
      </div>

      <label>
        Notes <span className="muted">(optional)</span>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Two Sum, LRU Cache…"
        />
      </label>

      <div className="log-footer">
        <div className="muted">
          <strong>{problems}</strong> problems · <strong>{points}</strong> pts
          {existing ? ' · editing today' : ''}
        </div>
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : existing ? 'Update log' : 'Submit log'}
        </button>
      </div>
      {message && <p className="form-msg">{message}</p>}
    </form>
  );
}

function Counter({
  label,
  value,
  onChange,
  accent,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  accent: string;
  hint: string;
}) {
  return (
    <div className={`counter ${accent}`}>
      <div className="counter-label">
        <span>{label}</span>
        <small>{hint}</small>
      </div>
      <div className="counter-controls">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Decrease ${label}`}>
          −
        </button>
        <input
          type="number"
          min={0}
          max={99}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        />
        <button type="button" onClick={() => onChange(value + 1)} aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}