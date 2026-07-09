import { useApp } from '../lib/AppContext';
import { computeLeaderboard } from '../lib/scoring';

export function Leaderboard() {
  const { state } = useApp();
  const rows = computeLeaderboard(state);
  const leaderScore = rows[0]?.totalScore ?? 0;

  return (
    <section className="panel leaderboard">
      <div className="panel-head">
        <div>
          <h2>Leaderboard</h2>
          <p className="muted">Live standings · refreshes every 15s · 5 problems/day (any mix)</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Name</th>
              <th>Today</th>
              <th>Total</th>
              <th>Solved</th>
              <th>Streak</th>
              <th>Best</th>
              <th>Owes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isLeader = i === 0 && leaderScore > 0;
              return (
                <tr key={row.userId} className={isLeader ? 'leader-row' : undefined}>
                  <td>
                    <span className="rank">#{i + 1}</span>
                  </td>
                  <td>
                    <span className="name-cell">
                      {isLeader && <span className="crown" title="Current leader">👑</span>}
                      {row.displayName}
                    </span>
                  </td>
                  <td>
                    {row.todayGoalMet === null ? (
                      <span className="muted">—</span>
                    ) : (
                      <span className={row.todayGoalMet ? 'ok-text' : 'miss-text'}>
                        {row.todayScore} {row.todayGoalMet ? '✅' : '❌'}
                      </span>
                    )}
                  </td>
                  <td>
                    <strong>{row.totalScore}</strong>
                  </td>
                  <td>{row.totalProblems}</td>
                  <td>
                    <span className="streak">{row.currentStreak}🔥</span>
                  </td>
                  <td>{row.longestStreak}</td>
                  <td>
                    <span className={row.owesOutings > 0 ? 'miss-text' : 'ok-text'}>
                      {row.owesOutings}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
