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
          <p className="muted">
            Ranked by total points · Points = Easy×1 + Medium×2 + Hard×3 · updates live
          </p>
        </div>
        <div className="score-legend" aria-label="Scoring system">
          <span className="legend-pill easy">
            <i />Easy +1
          </span>
          <span className="legend-pill medium">
            <i />Medium +2
          </span>
          <span className="legend-pill hard">
            <i />Hard +3
          </span>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Today (pts)</th>
              <th>Total points</th>
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
                    <span className="total-pts">{row.totalScore}</span>
                    <span className="pts-suffix">pts</span>
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
