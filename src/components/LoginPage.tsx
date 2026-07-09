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
          Local sign-in only — tap your name. No Google, no password. Hit 5 problems/day; miss and you
          owe the outing bill.
        </p>

        <div className="player-pick">
          {USERS.map((u) => (
            <button key={u.id} type="button" className="player-btn" onClick={() => pick(u.id)}>
              <span className="player-avatar">{u.displayName.slice(0, 1)}</span>
              <span className="player-meta">
                <strong>{state.displayNames[u.id] || u.displayName}</strong>
                <small>Continue as {u.id}</small>
              </span>
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}
        <p className="muted login-note">
          This only stores who you are on this device. Anyone with the link can pick either name — that’s
          intentional for a 2-person duel.
        </p>
      </div>
    </div>
  );
}
