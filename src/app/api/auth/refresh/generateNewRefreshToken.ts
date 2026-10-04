import crypto from 'crypto';
import {PoolClient} from 'pg';

export async function generateNewRefreshToken(
  client: PoolClient,
  userId: string,
  sessionCreationTime: number,
  randomRefreshToken: string,
  refreshTokenExpiry: Date
) {
  const refreshTokenHash = crypto.createHash('sha256').update(randomRefreshToken).digest('hex');

  const insertNewTokenQuery = await client.query(
    `
        INSERT INTO refresh_tokens
        (token_hash, expiry_time, session_created_at, user_id) VALUES
        ($1, $2, $3, $4) RETURNING id
        `,
    [refreshTokenHash, refreshTokenExpiry, new Date(sessionCreationTime), userId]
  );

  return insertNewTokenQuery;
}
