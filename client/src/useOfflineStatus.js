import { useCallback, useEffect, useState } from 'react';
import { getOutboxCount, syncOutbox, OUTBOX_EVENT } from './offline';

export default function useOfflineStatus({ autoSync = true } = {}) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(async () => {
    const count = await getOutboxCount();
    setPendingCount(count);
    return count;
  }, []);

  const syncNow = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await refresh();
      return { synced: 0, failed: 0, remaining: await getOutboxCount() };
    }
    const result = await syncOutbox();
    await refresh();
    return result;
  }, [refresh]);

  useEffect(() => {
    refresh();

    const handleOnline = () => {
      setIsOnline(true);
      if (autoSync) syncNow();
    };
    const handleOffline = () => setIsOnline(false);
    const handleOutbox = () => refresh();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(OUTBOX_EVENT, handleOutbox);

    if (autoSync && navigator.onLine) {
      syncNow();
    }

    const interval = autoSync
      ? window.setInterval(() => {
          if (navigator.onLine) syncNow();
        }, 30_000)
      : null;

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(OUTBOX_EVENT, handleOutbox);
      if (interval) window.clearInterval(interval);
    };
  }, [autoSync, refresh, syncNow]);

  return { isOnline, pendingCount, refresh, syncNow };
}
