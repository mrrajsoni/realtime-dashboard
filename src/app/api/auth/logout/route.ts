import {NextRequest, NextResponse} from 'next/server';
import crypto from 'crypto';
import { dbPoolForClient } from '@/lib/DbPool/dbPoolForClient';

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get('refreshToken')?.value;
  if (!refreshToken) {
    return NextResponse.json(
      {
        message: 'Refresh token not found',
      },
      {
        status: 401,
      }
    );
  }

  const hashedRefreshTokenFromCookie = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  await dbPoolForClient.query(
    `UPDATE refresh_tokens
    SET revoked_at = NOW()
    WHERE token_hash = $1 
    AND revoked_at IS NULL
    RETURNING *`,
    [hashedRefreshTokenFromCookie]
  );

  const response = NextResponse.json({
    message: 'Successfully logged out',
  });

  response.cookies.delete('refreshToken');
  return response;
}
