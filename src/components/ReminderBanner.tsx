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
            body: '9 PM check-in — log your LeetCode solves and keep the streak alive.',
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
        <strong>9 PM reminder</strong>
        <p className="muted">
          {enabled && permission === 'granted'
            ? 'On — we’ll nudge you around 9:00 PM while this tab is open.'
            : 'Optional browser notification when this tab is open.'}
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