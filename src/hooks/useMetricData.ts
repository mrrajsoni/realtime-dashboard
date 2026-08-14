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
    const socketInstance = webSocketManager;
    const unsub = socketInstance.subscribe(metricName, (data) => {
      console.info('Setter', data);
      setMetricData(data);
    });
    return () => {
      unsub();
    };
  }, [metricName]);

  return {metricData};
}
