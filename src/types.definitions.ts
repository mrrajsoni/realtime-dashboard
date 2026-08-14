export type TMetricData = {
  value: number;
  trend: 'up' | 'down';
  previousValue: number;
  metricName: string;
};
