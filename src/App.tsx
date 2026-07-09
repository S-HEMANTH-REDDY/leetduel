import { AppProvider, useApp } from './lib/AppContext';
import { LoginPage } from './components/LoginPage';
import { Leaderboard } from './components/Leaderboard';
import { LogForm } from './components/LogForm';
import { PayTab } from './components/PayTab';
import { StatsDashboard } from './components/StatsDashboard';
import { AdminPanel } from './components/AdminPanel';
import { ReminderBanner } from './components/ReminderBanner';
import { remoteConfigured } from './lib/storage';

const SYNC_LABEL: Record<string, string> = {
  idle: 'Synced',
  syncing: 'Syncing…',
  saved: 'Synced',
  error: 'Saved on this device',
};

function Shell() {
  const { ready, user, logout, refresh, syncStatus } = useApp();

  if (!ready) {
    return (
      <div className="boot">
        <div className="spinner" />
        <p>Loading LeetDuel…</p>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">LeetDuel</span>
          <span className="muted hide-sm">5 problems/day · miss → you pay outside</span>
        </div>
        <div className="top-actions">
          <span className={`sync-pill ${syncStatus}`} title="Sync status">
            <span className="sync-dot" />
            {SYNC_LABEL[syncStatus] ?? 'Synced'}
          </span>
          <button type="button" className="btn ghost" onClick={() => refresh()}>
            Refresh
          </button>
          <span className="who">
            Signed in as <strong>{user.displayName}</strong>
          </span>
          <button type="button" className="btn ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      {!remoteConfigured() && (
        <div className="banner warn">
          Running in local-only mode. Data stays in this browser until a shared backend is configured.
        </div>
      )}

      <main className="layout">
        <Leaderboard />
        <PayTab />
        <LogForm />
        <ReminderBanner />
        <StatsDashboard />
        <AdminPanel />
      </main>

      <footer className="footer muted">
        Goal: 5+ problems/day (any Easy/Medium/Hard mix), logged with proof before 11:59 PM · Miss a
        day → owe the next outing bill · Past days are locked to keep it fair
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
