import {WebSocketServer} from 'ws';
import {Redis} from 'ioredis';
import {Pool} from 'pg';

const wss = new WebSocketServer({
  port: 8080,
});

const subscribersMap = new Map();

const redisClient = new Redis();
const pool = new Pool();

await pool.query(`
  CREATE TABLE IF NOT EXISTS metrics (
  id SERIAL PRIMARY KEY,
  metric_name TEXT NOT NULL,
  value NUMERIC NOT NULL,
  trend TEXT NOT NULL,
  previous_value NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);

redisClient.psubscribe('metric:*');

wss.on('connection', (ws) => {
  ws.on('message', (socketData) => {
    const metricName = socketData.toString();
    if (!subscribersMap.has(metricName)) {
      subscribersMap.set(metricName, new Set());
    }
    subscribersMap.get(metricName)?.add(ws);
  });

  ws.on('close', () => {
    subscribersMap.forEach((value, key) => {
      if (value.has(ws)) {
        value.delete(ws);
        if (value.size === 0) {
          subscribersMap.delete(key);
        }
      }
    });
  });
});

redisClient.on('pmessage', async (pattern, channel, message) => {
  console.log(`Received message for: ${channel} ${message}`);
  const parsedJSON = JSON.parse(message);

  await pool.query(
    `INSERT INTO metrics (metric_name, value, trend, previous_value) VALUES ($1, $2, $3, $4)`,
    [parsedJSON.metricName, parsedJSON.value, parsedJSON.trend, parsedJSON.previousValue]
  );

  subscribersMap.forEach((value, key) => {
    const subscriberChannelName = 'metric:' + key;
    if (subscriberChannelName === channel) {
      value.forEach((ws) => {
        ws.send(message);
      });
    }
  });
});
