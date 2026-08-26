export type TMetricData = {
  value: number;
  trend: 'up' | 'down';
  previousValue: number;
  metricName: string;
};

export type TAuthenticationStatus = 'checking' | 'authenticated' | 'unauthenticated';
