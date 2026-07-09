import { useMemo, useState } from 'react';
import { useApp } from '../lib/AppContext';
import { computePayTab } from '../lib/scoring';
import type { UserId } from '../lib/types';
import { DAILY_GOAL } from '../lib/types';

export function PayTab() {
  const { state, markPaid, undoPayment } = useApp();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<UserId | null>(null);

  const rows = useMemo(() => {
    const ids: UserId[] = ['hemanth', 'abhiram'];
    return ids.map((id) => {
      const tab = computePayTab(state, id);
      return {
        userId: id,
        name: state.displayNames[id],
        ...tab,
      };
    });
  }, [state]);

  function onPaid(userId: UserId, name: string) {
    if (!confirm(`${name} just covered the outing bill? This decreases their owe count by 1.`)) {
      return;
    }
    setBusy(userId);
    markPaid(userId);
    setMsg(`${name} marked as paid — owe count −1.`);
    window.setTimeout(() => setBusy(null), 300);
  }

  function onUndo(userId: UserId, name: string) {
    if (!confirm(`Undo last payment for ${name}?`)) return;
    setBusy(userId);
    undoPayment(userId);
    setMsg(`Undid last payment for ${name}.`);
    window.setTimeout(() => setBusy(null), 300);
  }

  return (
    <section className="panel pay-tab">
      <div className="panel-head">
        <div>
          <h2>Who pays outside?</h2>
          <p className="muted">
            Miss a day under {DAILY_GOAL} problems → you owe the next outing bill. Any mix counts (2
            Easy + 3 Medium, or 2 Easy + 2 Medium + 1 Hard, etc.). Tap <strong>They paid</strong> when
            someone covers the bill — their owe count drops by 1.
          </p>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Missed days</th>
              <th>Times paid</th>
              <th>Still owes</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} className={row.owesOutings > 0 ? 'owes-row' : undefined}>
                <td>
                  <strong>{row.name}</strong>
                </td>
                <td>{row.missed}</td>
                <td>{row.timesPaid}</td>
                <td>
                  <span className={`owe-count ${row.owesOutings > 0 ? 'hot' : 'cool'}`}>
                    {row.owesOutings}
                  </span>
                </td>
                <td>
                  <div className="pay-actions">
                    <button
                      type="button"
                      className="btn primary sm"
                      disabled={row.owesOutings <= 0 || busy === row.userId}
                      onClick={() => void onPaid(row.userId, row.name)}
                    >
                      {busy === row.userId ? '…' : 'They paid'}
                    </button>
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={row.timesPaid <= 0 || busy === row.userId}
                      onClick={() => void onUndo(row.userId, row.name)}
                    >
                      Undo
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.some((r) => r.missedDates.length > 0) && (
        <div className="miss-dates">
          {rows.map((row) =>
            row.missedDates.length === 0 ? null : (
              <div key={row.userId}>
                <strong>{row.name} missed:</strong>{' '}
                <span className="muted">{row.missedDates.slice(-8).join(', ')}</span>
                {row.missedDates.length > 8 ? ' …' : ''}
              </div>
            ),
          )}
        </div>
      )}

      {state.paymentHistory.length > 0 && (
        <div className="pay-history">
          <h3>Recent payments</h3>
          <ul>
            {state.paymentHistory.slice(0, 8).map((p) => (
              <li key={p.id}>
                <strong>{state.displayNames[p.userId]}</strong> paid ·{' '}
                <span className="muted">{new Date(p.paidAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {msg && <p className="form-msg">{msg}</p>}
    </section>
  );
}
