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

  try {
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
      return deadSessionResponse('User invalid, logout');
    }

    const currentRefreshTokenExpiryTime = new Date(
      queryRefreshTokenTable.rows[0].expiry_time
    ).getTime();

    const isRevoked: Date | null = queryRefreshTokenTable.rows[0].revoked_at;
    const isUsed: Date | null = queryRefreshTokenTable.rows[0].used_at;

    const sessionCreationTime = new Date(
      queryRefreshTokenTable.rows[0].session_created_at
    ).getTime();
    const plus30Days = 30 * 24 * 60 * 60 * 1000;

    const isSessionExpired = Date.now() > plus30Days + sessionCreationTime;

    const userId = queryRefreshTokenTable.rows[0].user_id;

    if (isUsed) {
      await logoutAllDevices(client, userId);
      await client.query('COMMIT');
      return deadSessionResponse('Session expired. Please login again');
    }

    if (Date.now() > currentRefreshTokenExpiryTime || isRevoked || isSessionExpired) {
      await client.query('ROLLBACK');
      return deadSessionResponse('Session expired. Please login again');
    }

    const rowId = queryRefreshTokenTable.rows[0].id;

    const randomRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(randomRefreshToken).digest('hex');

    const refreshTokenExpiry = new Date(Date.now() + 604800000); // 7 days in milliseconds (7 * 24 * 60 * 60 * 1000)

    const insertNewTokenQuery = await client.query(
      `
    INSERT INTO refresh_tokens
    (token_hash, expiry_time, session_created_at, user_id) VALUES
    ($1, $2, $3, $4) RETURNING id
    `,
      [refreshTokenHash, refreshTokenExpiry, new Date(sessionCreationTime), userId]
    );

    const newRowId = insertNewTokenQuery.rows[0].id;

    await client.query(
      `UPDATE refresh_tokens
    SET used_at = $1,
    replaced_by = $2
    WHERE id = $3
    AND used_at IS NULL`,
      [new Date(Date.now()), newRowId, rowId]
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

    return response;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Every 401 here means the refresh token is dead for good, so clear the cookie —
// otherwise the browser keeps replaying it and the client retries into the same wall.
function deadSessionResponse(message: string) {
  const response = NextResponse.json({message}, {status: 401});
  response.cookies.delete('refreshToken');
  return response;
}

async function logoutAllDevices(poolClient: PoolClient, userId: number) {
  await poolClient.query(`UPDATE refresh_tokens SET revoked_at = $1 WHERE user_id = $2`, [
    new Date(Date.now()),
    userId,
  ]);
}
