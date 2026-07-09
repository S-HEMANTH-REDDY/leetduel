import { useState, type FormEvent } from 'react';
import { useApp } from '../lib/AppContext';
import { USERS, type UserId } from '../lib/types';

export function LoginPage() {
  const { state, createPin, loginWithPin } = useApp();
  const [selected, setSelected] = useState<UserId | null>(null);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isNew = selected ? !state.pins?.[selected] : false;
  const selectedName = selected ? state.displayNames[selected] || selected : '';

  function choose(userId: UserId) {
    setSelected(userId);
    setPin('');
    setPin2('');
    setError('');
  }

  function back() {
    setSelected(null);
    setPin('');
    setPin2('');
    setError('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits.');
      return;
    }
    if (isNew && pin !== pin2) {
      setError('PINs do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const ok = isNew ? await createPin(selected, pin) : await loginWithPin(selected, pin);
      if (!ok) setError(isNew ? 'Could not set PIN — try again.' : 'Wrong PIN.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-glow" aria-hidden />
      <div className="login-card">
        <p className="brand-mark">LeetDuel</p>

        {!selected ? (
          <>
            <h1>Who’s logging in?</h1>
            <p className="muted">
              Log 5+ problems every day with proof (LeetCode number + title) before 11:59 PM — miss it
              and you owe the next outing bill.
            </p>
            <div className="player-pick">
              {USERS.map((u) => (
                <button key={u.id} type="button" className="player-btn" onClick={() => choose(u.id)}>
                  <span className="player-avatar">
                    {(state.displayNames[u.id] || u.displayName).slice(0, 1)}
                  </span>
                  <span className="player-meta">
                    <strong>{state.displayNames[u.id] || u.displayName}</strong>
                    <small>{state.pins?.[u.id] ? 'Enter your PIN' : 'Set up your PIN'}</small>
                  </span>
                </button>
              ))}
            </div>
            <p className="muted login-note">
              Each player has their own PIN, so only you can log in as you. You can only edit your own
              logs and pay tab, and past days lock at midnight.
            </p>
          </>
        ) : (
          <form onSubmit={submit}>
            <h1>{isNew ? `Set ${selectedName}’s PIN` : `Welcome back, ${selectedName}`}</h1>
            <p className="muted">
              {isNew
                ? 'Pick a 4–8 digit PIN. You’ll use it to sign in on any device.'
                : 'Enter your PIN to continue.'}
            </p>

            <label>
              PIN
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="••••"
              />
            </label>

            {isNew && (
              <label>
                Confirm PIN
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={8}
                  value={pin2}
                  onChange={(e) => setPin2(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="••••"
                />
              </label>
            )}

            {error && <p className="error">{error}</p>}

            <div className="login-actions">
              <button type="button" className="btn ghost" onClick={back} disabled={busy}>
                Back
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? '…' : isNew ? 'Create PIN & continue' : 'Unlock'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
