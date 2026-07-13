import { useMemo, useState } from 'react';
import { useApp } from '../lib/AppContext';
import { computePayTab } from '../lib/scoring';
import type { UserId } from '../lib/types';
import { DAILY_GOAL } from '../lib/types';

export function PayTab() {
  const { user, state, markPaid, undoPayment } = useApp();
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

  const owerText = useMemo(() => {
    const [a, b] = rows;
    const cancelled = Math.min(a.missed, b.missed);
    const tally = `${a.name} missed ${a.missed} · ${b.name} missed ${b.missed}${
      cancelled > 0 ? ` — ${cancelled} cancel out` : ''
    }.`;
    const ower = rows.find((r) => r.owesOutings > 0);
    if (!ower) {
      return { owes: false, text: `All square 🤝 — nobody owes an outing right now. ${tally}` };
    }
    const n = ower.owesOutings;
    return {
      owes: true,
      text: `${ower.name} owes ${n} outing${n === 1 ? '' : 's'} 💸. ${tally}`,
    };
  }, [rows]);

  function onPaid(userId: UserId) {
    if (!confirm('Confirm you covered the outing bill? This lowers your owe count by 1.')) {
      return;
    }
    setBusy(userId);
    markPaid(userId);
    setMsg('Marked as paid — your owe count dropped by 1.');
    window.setTimeout(() => setBusy(null), 300);
  }

  function onUndo(userId: UserId) {
    if (!confirm('Undo your last payment?')) return;
    setBusy(userId);
    undoPayment(userId);
    setMsg('Undid your last payment.');
    window.setTimeout(() => setBusy(null), 300);
  }

  return (
    <section className="panel pay-tab">
      <div className="panel-head">
        <div>
          <h2>Who pays outside?</h2>
          <p className="muted">
            Any day under {DAILY_GOAL} problems (any Easy/Medium/Hard mix) — or not logged before
            11:59:59 PM — is a strike. Both players’ strikes cancel out, so only the{' '}
            <strong>difference</strong> is owed: whoever missed more pays the gap. Tap{' '}
            <strong>I paid</strong> after you cover a bill.
          </p>
        </div>
      </div>

      <div className={`pay-summary ${owerText.owes ? 'owes' : 'square'}`}>
        {owerText.text}
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
                  {user?.id === row.userId ? (
                    <div className="pay-actions">
                      <button
                        type="button"
                        className="btn primary sm"
                        disabled={row.owesOutings <= 0 || busy === row.userId}
                        onClick={() => void onPaid(row.userId)}
                      >
                        {busy === row.userId ? '…' : 'I paid'}
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={row.timesPaid <= 0 || busy === row.userId}
                        onClick={() => void onUndo(row.userId)}
                      >
                        Undo
                      </button>
                    </div>
                  ) : (
                    <span className="muted">their tab</span>
                  )}
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
