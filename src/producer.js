import {redisClient} from './redisClientForServer.js';

const METRIC_FAKE_DATA = {
  userCount: {
    value: 10,
    trend: 'up',
    previousValue: 8,
  },
  sales: {
    value: 100,
    trend: 'down',
    previousValue: 120,
  },
  errorRate: {
    value: 1,
    trend: 'up',
    previousValue: 0.5,
  },
};

function sendMetricData(metricName) {
  const randomValue = Math.floor(Math.random() * 20);
  return {
    value: METRIC_FAKE_DATA[metricName].value + randomValue,
    trend: METRIC_FAKE_DATA[metricName].trend,
    previousValue: METRIC_FAKE_DATA[metricName].previousValue + randomValue,
    metricName: metricName.toString(),
  };
}

setInterval(() => {
  Object.keys(METRIC_FAKE_DATA).forEach((metricName) => {
    const metricData = sendMetricData(metricName);
    redisClient.publish('metric:' + metricName, JSON.stringify(metricData));
  });
}, 5000);
