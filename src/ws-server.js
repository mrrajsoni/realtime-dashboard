import {WebSocketServer} from 'ws';
import {Redis} from 'ioredis';

const wss = new WebSocketServer({
  port: 8080,
});

const subscribersMap = new Map();

const redisClient = new Redis();

wss.on('connection', (ws) => {
  ws.on('message', (socketData) => {
    const metricName = socketData.toString();
    if (!subscribersMap.has(metricName)) {
      subscribersMap.set(metricName, new Set());
      redisClient.subscribe('metric:' + metricName);
    }
    subscribersMap.get(metricName)?.add(ws);
  });

  ws.on('close', () => {
    subscribersMap.forEach((value, key) => {
      if (value.has(ws)) {
        value.delete(ws);
        if (value.size === 0) {
          redisClient.unsubscribe('metric:' + key);
          subscribersMap.delete(key);
        }
      }
    });
  });
});

redisClient.on('message', (channel, message) => {
  console.log(`Received message for: ${channel} ${message}`);
  subscribersMap.forEach((value, key) => {
    const subscriberChannelName = 'metric:' + key;
    if (subscriberChannelName === channel) {
      value.forEach((ws) => {
        ws.send(message);
      });
    }
  });
});
