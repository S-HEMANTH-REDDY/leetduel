import { useMemo, useState } from 'react';
import { useApp } from '../lib/AppContext';
import { calcPoints, calcProblems, exportCsv, goalMet, todayKey } from '../lib/scoring';

export function AdminPanel() {
  const { user, state, deleteLog, resetAll, updateDisplayName } = useApp();
  const [msg, setMsg] = useState('');
  const [nameA, setNameA] = useState(state.displayNames.hemanth);
  const [nameB, setNameB] = useState(state.displayNames.abhiram);

  const myLogs = useMemo(
    () =>
      [...state.logs]
        .filter((l) => l.userId === user?.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state.logs, user?.id],
  );

  const todayLog = myLogs.find((l) => l.date === todayKey());

  if (!user?.isAdmin) return null;

  function onReset() {
    if (!confirm('Reset the entire competition? This deletes all logs for both players.')) return;
    resetAll();
    setMsg('Competition reset.');
  }

  function onDelete(id: string) {
    if (!confirm('Delete this submission?')) return;
    deleteLog(id);
    setMsg('Submission deleted.');
  }

  function onSaveNames() {
    updateDisplayName('hemanth', nameA);
    updateDisplayName('abhiram', nameB);
    setMsg('Display names updated.');
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
          <h2>Admin</h2>
          <p className="muted">Edit, delete, export, or reset</p>
        </div>
        <button type="button" className="btn ghost" onClick={downloadCsv}>
          Export CSV
        </button>
      </div>

      <div className="admin-grid">
        <div>
          <h3>Display names</h3>
          <div className="name-edit">
            <input value={nameA} onChange={(e) => setNameA(e.target.value)} placeholder="Player 1" />
            <input value={nameB} onChange={(e) => setNameB(e.target.value)} placeholder="Player 2" />
            <button type="button" className="btn" onClick={() => void onSaveNames()}>
              Save names
            </button>
          </div>
        </div>

        <div>
          <h3>Danger zone</h3>
          <button type="button" className="btn danger" onClick={() => void onReset()}>
            Reset competition
          </button>
          {todayLog && (
            <p className="muted" style={{ marginTop: 8 }}>
              Today’s log can also be edited from the log form above.
            </p>
          )}
        </div>
      </div>

      <h3>Your submissions</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>E / M / H</th>
              <th>Pts</th>
              <th>Goal</th>
              <th>Notes</th>
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
                <td className="notes-cell">{log.notes || '—'}</td>
                <td>
                  <button type="button" className="btn danger sm" onClick={() => void onDelete(log.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {todayLog && (
        <p className="muted">
          Tip: change counts in Tonight’s log and hit Update — duplicate same-day submits are edits, not
          new rows. ({calcProblems(todayLog.easy, todayLog.medium, todayLog.hard)} problems today)
        </p>
      )}

      {msg && <p className="form-msg">{msg}</p>}
    </section>
  );
}