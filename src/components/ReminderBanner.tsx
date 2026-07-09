import { useEffect, useState } from 'react';

const REMINDER_KEY = 'leetcode-duel-reminder';

export function ReminderBanner() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(REMINDER_KEY) === '1');
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );

  useEffect(() => {
    if (!enabled || typeof Notification === 'undefined') return;

    const tick = () => {
      const now = new Date();
      if (now.getHours() === 21 && now.getMinutes() === 0) {
        const dayKey = now.toDateString();
        const sentKey = `leetcode-duel-reminded-${dayKey}`;
        if (sessionStorage.getItem(sentKey)) return;
        if (Notification.permission === 'granted') {
          new Notification('LeetDuel reminder', {
            body: 'Log your 5 problems before 11:59 PM — or you owe the next outing bill.',
            icon: '/favicon.svg',
          });
          sessionStorage.setItem(sentKey, '1');
        }
      }
    };

    tick();
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, [enabled]);

  async function enable() {
    if (typeof Notification === 'undefined') {
      alert('Notifications are not supported in this browser.');
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      localStorage.setItem(REMINDER_KEY, '1');
      setEnabled(true);
    }
  }

  function disable() {
    localStorage.setItem(REMINDER_KEY, '0');
    setEnabled(false);
  }

  return (
    <div className="reminder">
      <div>
        <strong>Daily 9 PM nudge</strong>
        <p className="muted">
          {enabled && permission === 'granted'
            ? 'On — we’ll remind you at 9 PM to log before the 11:59 PM deadline (while this tab is open).'
            : 'Optional browser reminder before the nightly deadline (works while this tab is open).'}
        </p>
      </div>
      {enabled && permission === 'granted' ? (
        <button type="button" className="btn ghost" onClick={disable}>
          Turn off
        </button>
      ) : (
        <button type="button" className="btn" onClick={() => void enable()}>
          Enable
        </button>
      )}
    </div>
  );
}