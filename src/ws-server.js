import {WebSocketServer} from 'ws';
import {Redis} from 'ioredis';
import {Pool} from 'pg';

const wss = new WebSocketServer({
  port: 8080,
});

const subscribersMap = new Map();

const redisClient = new Redis();
const ticketRedisClient = new Redis();

const pool = new Pool();

// create metrics table
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

//Create user table
await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email_address TEXT UNIQUE NOT NULL,
  pass_hash VARCHAR NOT NULL,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);

//Create OTP code table
await pool.query(`
  CREATE TABLE IF NOT EXISTS otp_codes (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  otp_code_hash VARCHAR NOT NULL,
  purpose TEXT NOT NULL,
  expiry_time TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
  )
`);

//Create REFRESH TOKEN table
await pool.query(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  token_hash TEXT NOT NULL,
  expiry_time TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by INT REFERENCES refresh_tokens(id),
  used_at TIMESTAMPTZ,
  session_created_at TIMESTAMPTZ NOT NULL
  )
`);

await pool.query(`
  ALTER TABLE refresh_tokens 
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS session_created_at TIMESTAMPTZ NOT NULL;

`);

redisClient.psubscribe('metric:*');

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, 'http://localhost:8080');
  const searchParams = url.searchParams;
  const ticketFromParam = searchParams.get('ticket');

  if (!ticketFromParam) {
    ws.close(4401, 'Missing ticket');
    return;
  }

  const ticketId = await ticketRedisClient.getdel(`ws:ticket:${ticketFromParam}`);

  if (!ticketId) {
    ws.close(4401, 'Invalid ticket id');
    return;
  }

  ws.userId = ticketId;
  ws.isAuthenticated = true;

  ws.on('message', (socketData) => {
    if (!ws.isAuthenticated) {
      return;
    }
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
