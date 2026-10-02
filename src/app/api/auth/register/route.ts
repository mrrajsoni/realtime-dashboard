import {NextRequest, NextResponse} from 'next/server';
import bcrypt from 'bcrypt';
import {Resend} from 'resend';
import {dbPoolForClient} from '@/lib/DbPool/dbPoolForClient';

const resend = new Resend(process.env.RESEND_API);

function generateOTP() {
  const digits = '0123456789';
  let OTP = '';
  for (let i = 0; i < 6; i += 1) {
    OTP += digits[Math.floor(Math.random() * digits.length)];
  }
  return OTP;
}

export async function POST(request: NextRequest) {
  const requestBody = await request.json();

  const email = requestBody.email;
  const pass = requestBody.pass;
  const emailRow = await dbPoolForClient.query(
    `SELECT email_address FROM users where email_address = $1`,
    [email]
  );

  const doesEmailExist = emailRow.rowCount;

  if (doesEmailExist) {
    return NextResponse.json(
      {
        message: 'Use different email',
      },
      {
        status: 409,
      }
    );
  }

  const randomOTP = generateOTP();

  const passwordHash = await bcrypt.hash(pass, 10);

  const insertedIntoUserRow = await dbPoolForClient.query(
    `INSERT INTO users (email_address, pass_hash, is_verified) VALUES ($1, $2, $3) RETURNING *`,
    [email, passwordHash, false]
  );

  const otpHash = await bcrypt.hash(randomOTP, 10);

  const tenMinutesLater = new Date(Date.now() + 10 * 60 * 1000);

  await dbPoolForClient.query(
    `INSERT INTO otp_codes (user_id, otp_code_hash, purpose, expiry_time) VALUES ($1, $2, $3, $4)`,
    [insertedIntoUserRow.rows[0].id, otpHash, 'registration', tenMinutesLater]
  );

  const {data, error} = await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: ['rajsoni19619@gmail.com'],
    subject: 'Verify your account',
    html: `<strong>It works! - ${randomOTP}</strong>`,
  });

  if (data?.id) {
    return NextResponse.json({
      message: 'OTP is sent to your email. Please verify',
    });
  }
  if (error) {
    return NextResponse.json({
      message: 'Error while registering. Please try again later.',
    });
  }

  return NextResponse.json({
    message: 'Something went wrong, please try again.',
  });
}
