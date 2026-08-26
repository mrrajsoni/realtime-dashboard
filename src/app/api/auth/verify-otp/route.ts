import {NextRequest, NextResponse} from 'next/server';
import {Pool} from 'pg';
import bcrypt from 'bcrypt';

const pool = new Pool();
export async function POST(request: NextRequest) {
  const body = await request.json();
  const userOtp = body.otp;
  const userEmail = body.email;

  const queryUser = await pool.query(`SELECT id FROM users WHERE email_address = $1`, [userEmail]);

  if (!queryUser.rows[0]) {
    return NextResponse.json(
      {
        message: "User doesn't exist",
      },
      {status: 400}
    );
  }

  const otpVerification = await pool.query(
    `SELECT id, user_id, otp_code_hash, expiry_time, consumed_at, purpose FROM otp_codes WHERE user_id = $1 AND purpose = $2 ORDER BY id DESC`,
    [queryUser.rows[0].id, 'registration']
  );

  if (!otpVerification.rows[0]) {
    return NextResponse.json(
      {
        message: 'No OTP found',
      },
      {status: 400}
    );
  }

  const isOtpMatching = await bcrypt.compare(userOtp, otpVerification.rows[0].otp_code_hash);
  const currentTime = Date.now();
  const expiryTime = new Date(otpVerification.rows[0].expiry_time).getTime();

  const otpConsumedAt = otpVerification.rows[0].consumed_at;

  if (Boolean(otpConsumedAt)) {
    return NextResponse.json(
      {
        message: 'OTP already verified',
      },
      {
        status: 400,
      }
    );
  }
  if (!isOtpMatching) {
    return NextResponse.json(
      {
        message: 'Invalid OTP',
      },
      {
        status: 400,
      }
    );
  }

  if (currentTime > expiryTime) {
    return NextResponse.json(
      {
        message: 'OTP expired',
      },
      {
        status: 400,
      }
    );
  }

  await pool.query(`UPDATE otp_codes SET consumed_at = NOW() WHERE id = $1 AND purpose = $2`, [
    otpVerification.rows[0].id,
    otpVerification.rows[0].purpose,
  ]);

  await pool.query(`UPDATE users SET is_verified = $1 WHERE email_address = $2`, [true, userEmail]);

  return NextResponse.json({
    message: 'Successfully verified',
  });
}
