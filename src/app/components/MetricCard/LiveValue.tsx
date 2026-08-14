'use client';

import {useMetricData} from '@/hooks/useMetricData';

const TREND_ICONS_MAPPING = {
  up: '▲',
  down: '▼',
};

const LiveValue = ({metricName}: {metricName: string}) => {
  const {metricData} = useMetricData(metricName);

  return (
    <div>
      <span>{metricData?.value}</span> {metricData ? TREND_ICONS_MAPPING[metricData?.trend] : ''}
      <span>Prev {metricData?.previousValue}</span>
    </div>
  );
};

export default LiveValue;
