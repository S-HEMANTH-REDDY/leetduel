import { useState } from 'react';
import { useApp } from '../lib/AppContext';
import { USERS, type UserId } from '../lib/types';

export function LoginPage() {
  const { loginAs, state } = useApp();
  const [error, setError] = useState('');

  function pick(userId: UserId) {
    const ok = loginAs(userId);
    if (!ok) setError('Could not sign in');
    else setError('');
  }

  return (
    <div className="login-shell">
      <div className="login-glow" aria-hidden />
      <div className="login-card">
        <p className="brand-mark">LeetDuel</p>
        <h1>Who’s logging in?</h1>
        <p className="muted">
          Tap your name to sign in. Log 5+ problems every day with proof (LeetCode number + title)
          before 11:59 PM — miss it and you owe the next outing bill.
        </p>

        <div className="player-pick">
          {USERS.map((u) => (
            <button key={u.id} type="button" className="player-btn" onClick={() => pick(u.id)}>
              <span className="player-avatar">{u.displayName.slice(0, 1)}</span>
              <span className="player-meta">
                <strong>{state.displayNames[u.id] || u.displayName}</strong>
                <small>Tap to continue</small>
              </span>
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}
        <p className="muted login-note">
          You can only edit your own logs and pay tab. Past days lock at midnight so nobody can
          backfill a missed day.
        </p>
      </div>
    </div>
  );
}
