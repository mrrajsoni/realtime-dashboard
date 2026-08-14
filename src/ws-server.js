import {WebSocketServer} from 'ws';

const wss = new WebSocketServer({
  port: 8080,
});

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
  return {
    value: METRIC_FAKE_DATA[metricName].value,
    trend: METRIC_FAKE_DATA[metricName].trend,
    previousValue: METRIC_FAKE_DATA[metricName].previousValue,
    metricName: metricName.toString(),
  };
}
wss.on('connection', (ws) => {
  ws.on('message', (metricName) => {
    console.log(`Received subscription for: ${metricName}`);

    const interval = setInterval(() => {
      const metricResult = sendMetricData(metricName);
      ws.send(JSON.stringify(metricResult));
    }, 5000);

    ws.on('close', () => clearInterval(interval)); // cleanup on disconnect
  });
});
