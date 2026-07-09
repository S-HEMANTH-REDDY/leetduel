import { useMemo, useState } from 'react';
import { useApp } from '../lib/AppContext';
import { calcPoints, calcProblems, exportCsv, goalMet, todayKey } from '../lib/scoring';

export function AdminPanel() {
  const { user, state, deleteLog, resetAll, updateDisplayName } = useApp();
  const [msg, setMsg] = useState('');
  const [myName, setMyName] = useState(user ? state.displayNames[user.id] : '');
  const [resetText, setResetText] = useState('');

  const today = todayKey();
  const myLogs = useMemo(
    () =>
      [...state.logs]
        .filter((l) => l.userId === user?.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state.logs, user?.id],
  );

  const todayLog = myLogs.find((l) => l.date === today);

  if (!user) return null;

  function onReset() {
    if (resetText.trim().toUpperCase() !== 'RESET') {
      setMsg('Type RESET to confirm — this wipes all logs and pay tabs for BOTH players.');
      return;
    }
    if (!confirm('Start a brand-new competition? All logs, streaks, and pay tabs are erased for both players. Your friend will see this.')) return;
    resetAll();
    setResetText('');
    setMsg('Competition reset. Fresh start for both players.');
  }

  function onDelete(id: string) {
    if (!confirm('Delete today’s submission? (Only today’s log can be changed.)')) return;
    deleteLog(id);
    setMsg('Today’s submission deleted.');
  }

  function onSaveName() {
    if (!user) return;
    updateDisplayName(user.id, myName);
    setMsg('Your display name was updated.');
  }

  function downloadCsv() {
    const csv = exportCsv(state);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leetcode-duel-${todayKey()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel admin">
      <div className="panel-head">
        <div>
          <h2>My settings</h2>
          <p className="muted">You can only manage your own name and today’s log.</p>
        </div>
        <button type="button" className="btn ghost" onClick={downloadCsv}>
          Export CSV
        </button>
      </div>

      <div className="admin-grid">
        <div>
          <h3>Your display name</h3>
          <div className="name-edit">
            <input
              value={myName}
              onChange={(e) => setMyName(e.target.value)}
              placeholder="Your name"
              maxLength={24}
            />
            <button type="button" className="btn" onClick={() => void onSaveName()}>
              Save
            </button>
          </div>
        </div>

        <div>
          <h3>Danger zone</h3>
          <p className="muted" style={{ marginBottom: 8 }}>
            Reset erases <strong>everything for both players</strong> (logs, streaks, pay tabs) and
            starts a new competition. Type <code>RESET</code> to enable.
          </p>
          <div className="name-edit">
            <input
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              placeholder="Type RESET"
            />
            <button
              type="button"
              className="btn danger"
              disabled={resetText.trim().toUpperCase() !== 'RESET'}
              onClick={() => void onReset()}
            >
              Reset competition
            </button>
          </div>
        </div>
      </div>

      <h3>Your submissions &amp; proof</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>E / M / H</th>
              <th>Pts</th>
              <th>Goal</th>
              <th>Problems solved (proof)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {myLogs.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No submissions yet
                </td>
              </tr>
            )}
            {myLogs.map((log) => (
              <tr key={log.id}>
                <td>{log.date}</td>
                <td>
                  {log.easy}/{log.medium}/{log.hard}
                </td>
                <td>{calcPoints(log.easy, log.medium, log.hard)}</td>
                <td>{goalMet(log) ? '✅' : '❌'}</td>
                <td className="proof-cell">
                  {log.problems && log.problems.length > 0 ? (
                    <div className="proof-tags">
                      {log.problems.map((p) => (
                        <span key={p.id} className={`proof-tag ${p.difficulty}`}>
                          #{p.number} {p.title}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="muted">{log.notes || 'no proof listed'}</span>
                  )}
                </td>
                <td>
                  {log.date === today ? (
                    <button type="button" className="btn danger sm" onClick={() => void onDelete(log.id)}>
                      Delete
                    </button>
                  ) : (
                    <span className="muted" title="Past days are locked to keep the competition fair">
                      🔒 Locked
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {todayLog && (
        <p className="muted">
          Tip: edit today’s log and hit Update — same-day submits are edits, not new rows. (
          {calcProblems(todayLog.easy, todayLog.medium, todayLog.hard)} problems today)
        </p>
      )}

      {msg && <p className="form-msg">{msg}</p>}
    </section>
  );
}