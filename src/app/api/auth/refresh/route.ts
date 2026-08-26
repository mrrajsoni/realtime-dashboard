import {NextRequest, NextResponse} from 'next/server';
import {Pool, PoolClient} from 'pg';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const pool = new Pool();

export async function POST(request: NextRequest) {
  const refreshTokenFromCookie = request.cookies.get('refreshToken');

  if (!refreshTokenFromCookie) {
    return NextResponse.json(
      {
        message: 'Invalid cookie token',
      },
      {
        status: 401,
      }
    );
  }
  const lookUpHashForRefreshToken = crypto
    .createHash('sha256')
    .update(refreshTokenFromCookie?.value as string)
    .digest('hex');

  const client = await pool.connect();

  await client.query('BEGIN');

  const queryRefreshTokenTable = await client.query(
    `SELECT id, user_id, token_hash, expiry_time, used_at, revoked_at, session_created_at
    FROM refresh_tokens 
    WHERE token_hash = $1
    FOR UPDATE`,
    [lookUpHashForRefreshToken]
  );

  if (!queryRefreshTokenTable.rows.length) {
    await client.query('ROLLBACK');
    client.release();
    return NextResponse.json(
      {
        message: 'User invalid, logout',
      },
      {
        status: 401,
      }
    );
  }

  const currentRefreshTokenExpiryTime = new Date(
    queryRefreshTokenTable.rows[0].expiry_time
  ).getTime();
  const isRevoked: boolean = queryRefreshTokenTable.rows[0].revoked_at;
  const isUsed: boolean = queryRefreshTokenTable.rows[0].used_at;

  const sessionCreationTime = new Date(queryRefreshTokenTable.rows[0].session_created_at).getTime();
  const plus30Days = 30 * 24 * 60 * 60 * 1000;

  const isSessionExpired = Date.now() > plus30Days + sessionCreationTime;

  const userId = queryRefreshTokenTable.rows[0].user_id;

  if (isUsed) {
    await logoutAllDevices(client, userId);
    return NextResponse.json(
      {
        message: 'Session expired. Please login again',
      },
      {
        status: 401,
      }
    );
  }

  if (Date.now() > currentRefreshTokenExpiryTime || isRevoked || isSessionExpired) {
    await client.query('ROLLBACK');
    client.release();
    return NextResponse.json(
      {
        message: 'Session expired. Please login again',
      },
      {
        status: 401,
      }
    );
  }

  const rowId = queryRefreshTokenTable.rows[0].id;

  const randomRefreshToken = crypto.randomBytes(32).toString('hex');
  const refreshTokenHash = crypto.createHash('sha256').update(randomRefreshToken).digest('hex');

  const refreshTokenExpiry = new Date(Date.now() + 604800000); // 7 days in milliseconds (7 * 24 * 60 * 60 * 1000)

  await client.query(
    `UPDATE refresh_tokens 
    SET used_at = $1,
    token_hash = $2,
    expiry_time = $3
    WHERE id = $4
    AND used_at IS NULL`,
    [new Date(Date.now()), refreshTokenHash, refreshTokenExpiry, rowId]
  );

  const jwtSignature = jwt.sign({userId}, process.env.JWT_SECRET as string, {
    expiresIn: '15m',
  });

  await client.query('COMMIT');

  const response = NextResponse.json({
    accessToken: jwtSignature,
  });

  response.cookies.set('refreshToken', randomRefreshToken, {
    sameSite: 'strict',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: refreshTokenExpiry,
  });
  client.release();

  return response;
}

async function logoutAllDevices(poolClient: PoolClient, userId: number) {
  await poolClient.query(`UPDATE refresh_tokens SET revoked_at = $1 WHERE user_id = $2`, [
    new Date(Date.now()),
    userId,
  ]);
  await poolClient.query('COMMIT');
  poolClient.release();
}
