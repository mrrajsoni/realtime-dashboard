import {NextRequest, NextResponse} from 'next/server';
import {PoolClient} from 'pg';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {dbPoolForClient} from '@/lib/DbPool/dbPoolForClient';
import {generateNewRefreshToken} from './generateNewRefreshToken';

const REUSE_GRACE_MS = 15000;

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

  let client: PoolClient | null = null;

  try {
    client = await dbPoolForClient.connect();
    await client.query('BEGIN');

    const queryRefreshTokenTable = await client.query(
      `SELECT id, user_id, token_hash, expiry_time, used_at, revoked_at, replaced_by, session_created_at
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

    const isRevoked: Date | null = queryRefreshTokenTable.rows[0].revoked_at ?? null;
    const isUsed: Date | null = queryRefreshTokenTable.rows[0].used_at ?? null;

    const sessionCreationTime = new Date(
      queryRefreshTokenTable.rows[0].session_created_at
    ).getTime();

    const plus30Days = 30 * 24 * 60 * 60 * 1000;

    const isSessionExpired = Date.now() > plus30Days + sessionCreationTime;

    const userId = queryRefreshTokenTable.rows[0].user_id;

    if (isUsed) {
      const replacedBy: number | null = queryRefreshTokenTable.rows[0].replaced_by ?? null;
      const usedAtMs = new Date(queryRefreshTokenTable.rows[0].used_at).getTime();

      // No onward ticket: v1 was spent by logout or is ancient. No chain to follow.
      if (!replacedBy) {
        await logoutAllDevices(client, userId);
        await client.query('COMMIT');
        return deadSessionResponse('Session expired. Please login again');
      }

      const successor = await client.query(
        `SELECT id, user_id, expiry_time, used_at, revoked_at, session_created_at
        FROM refresh_tokens
        WHERE id = $1
        FOR UPDATE`,
        [replacedBy]
      );

      // The pointer says v2, but v2 is gone. Don't trust it.
      if (!successor.rows.length) {
        await logoutAllDevices(client, userId);
        await client.query('COMMIT');
        return deadSessionResponse('Session expired. Please login again');
      }

      const v2 = successor.rows[0];
      const v2SessionCreationTime = new Date(v2.session_created_at).getTime();
      const v2Expired =
        Date.now() > new Date(v2.expiry_time).getTime() ||
        v2.revoked_at !== null ||
        Date.now() > v2SessionCreationTime + plus30Days;

      // v2 exists but the coat is already gone (expired / revoked / 30-day
      // session over). Just send them to login, no need to log out all.
      if (v2Expired) {
        await client.query('ROLLBACK');
        return deadSessionResponse('Session expired. Please login again');
      }

      // v2 is fine but v1 showed up way too late. That's a photocopy
      // surfacing long after redemption — treat it as theft.
      if (Date.now() - usedAtMs > REUSE_GRACE_MS) {
        await logoutAllDevices(client, userId);
        await client.query('COMMIT');
        return deadSessionResponse('Session expired. Please login again');
      }

      // Slow friend, not a thief: v1 was redeemed seconds ago and v2 is still
      // good. Write v3 off v2 so both tabs keep walking. We can't hand back v2
      // itself — only its hash is stored, the raw value is long gone.
      return await rotateAndRespond(client, v2.id, userId, v2SessionCreationTime);
    }

    if (Date.now() > currentRefreshTokenExpiryTime || isRevoked || isSessionExpired) {
      await client.query('ROLLBACK');
      return deadSessionResponse('Session expired. Please login again');
    }

    const rowId = queryRefreshTokenTable.rows[0].id;

    return await rotateAndRespond(client, rowId, userId, sessionCreationTime);
  } catch (error) {
    if (!client) throw error;

    await client
      .query('ROLLBACK')
      .then(() => {
        throw error;
      })
      .catch(() => {
        throw error;
      });
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Write a fresh ticket v(n+1), then stamp v(n) as spent with a note saying
// "replaced by v(n+1)". That stamp + pointer is the chain.
// Call this only while holding the row lock inside a transaction.
// If the stamp affects 0 rows, someone else spent v(n) first — that's a fork,
// so revoke instead of extending the chain.
async function rotateAndRespond(
  client: PoolClient,
  prevRowId: number,
  userId: string,
  sessionCreationTime: number
) {
  const randomRefreshToken = crypto.randomBytes(32).toString('hex');
  const refreshTokenExpiry = new Date(Date.now() + 604800000); // 7 days in milliseconds (7 * 24 * 60 * 60 * 1000)

  const accessTokenQueryResult = await generateNewRefreshToken(
    client,
    userId,
    sessionCreationTime,
    randomRefreshToken,
    refreshTokenExpiry
  );

  const newRowId = accessTokenQueryResult.rows[0].id;

  const markUsed = await client.query(
    `UPDATE refresh_tokens
      SET used_at = $1,
      replaced_by = $2
      WHERE id = $3
      AND used_at IS NULL`,
    [new Date(Date.now()), newRowId, prevRowId]
  );

  if (markUsed.rowCount === 0) {
    // Someone spent this ticket between our read and our stamp. Fork, not a
    // slow friend — revoke rather than handing out more tickets.
    await logoutAllDevices(client, userId);
    await client.query('COMMIT');
    return deadSessionResponse('Session expired. Please login again');
  }

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
}

// Every 401 here means the refresh token is dead for good, so clear the cookie —
// otherwise the browser keeps replaying it and the client retries into the same wall.
function deadSessionResponse(message: string) {
  const response = NextResponse.json({message}, {status: 401});
  response.cookies.delete('refreshToken');
  return response;
}

async function logoutAllDevices(poolClient: PoolClient, userId: number | string) {
  await poolClient.query(`UPDATE refresh_tokens SET revoked_at = $1 WHERE user_id = $2`, [
    new Date(Date.now()),
    userId,
  ]);
}
