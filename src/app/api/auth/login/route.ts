import {NextRequest, NextResponse} from 'next/server';
import {Pool} from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const pool = new Pool();

export async function POST(request: NextRequest) {
  const requestBody = await request.json();
  const email = requestBody.email;
  const password = requestBody.password;

  const queryUser = await pool.query(
    `SELECT id, email_address, pass_hash, is_verified FROM users WHERE email_address = $1`,
    [email]
  );

  if (!queryUser.rows.length) {
    return NextResponse.json(
      {
        message: 'User not found',
      },
      {
        status: 404,
      }
    );
  }

  const isVeriedUser: boolean = queryUser.rows[0].is_verified;

  if (!isVeriedUser) {
    return NextResponse.json(
      {
        message: 'Your account is not verified',
      },
      {
        status: 401,
      }
    );
  }

  const passwordHashFromQuery = queryUser.rows[0].pass_hash;

  const isCorrectPassword = await bcrypt.compare(password, passwordHashFromQuery);

  if (!isCorrectPassword) {
    return NextResponse.json(
      {
        message: 'Incorrect password',
      },
      {
        status: 401,
      }
    );
  }
  const userId = queryUser.rows[0].id;
  const jwtSignature = jwt.sign({userId}, process.env.JWT_SECRET as string, {
    expiresIn: '15m',
  });

  if (!jwtSignature) {
    return NextResponse.json(
      {
        message: 'Something went wrong',
      },
      {
        status: 400,
      }
    );
  }

  const refreshToken = crypto.randomBytes(32).toString('hex');
  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const refreshTokenExpiry = Date.now() + 604800000; // 7 days in milliseconds (7 * 24 * 60 * 60 * 1000)

  await pool.query(
    `INSERT INTO  refresh_tokens (token_hash, expiry_time, user_id, session_created_at) VALUES ($1, $2, $3, $4)`,
    [refreshTokenHash, new Date(refreshTokenExpiry), userId, new Date()]
  );

  const response = NextResponse.json({accessToken: jwtSignature});

  response.cookies.set('refreshToken', refreshToken, {
    sameSite: 'strict',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: refreshTokenExpiry,
  });

  return response;
}
