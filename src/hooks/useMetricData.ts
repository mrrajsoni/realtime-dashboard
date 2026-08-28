import {apiFetch} from '@/Auth/apiFetch';
import {webSocketManager} from '@/WebSocket/WebSocketManager';
import {useEffect, useState} from 'react';

type TMetricData = {
  value: number;
  trend: 'up' | 'down';
  previousValue: number;
};

export function useMetricData(metricName: string) {
  const [metricData, setMetricData] = useState<TMetricData>();

  useEffect(() => {
    let cancelled = false;
    const socketInstance = webSocketManager;
    const fetchInitialData = async () => {
      const initialData = await apiFetch(`/api/metric?metric=${metricName}`);
      const metricData = await initialData.json();
      console.info(cancelled, 'cancel', metricName, 'metricName');
      if (!cancelled) setMetricData(metricData);
    };

    // apiFetch throws AuthExpired on a dead session; AuthManager's listeners already
    // handle the redirect, so swallow it here instead of leaking an unhandled rejection.
    fetchInitialData().catch(() => {});

    const unsub = socketInstance.subscribe(metricName, (data) => {
      setMetricData(data);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [metricName]);

  return {metricData};
}
