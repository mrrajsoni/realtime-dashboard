'use client';

import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {useRouter} from 'next/navigation';
import {FormEvent, useState} from 'react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const OTP_LENGTH = 6;

type TFieldErrors = {
  email?: string;
  pass?: string;
  otp?: string;
};

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<'register' | 'verify-otp'>('register');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [otp, setOtp] = useState('');
  const [fieldErrors, setFieldErrors] = useState<TFieldErrors>({});
  const [serverMessage, setServerMessage] = useState<{type: 'success' | 'error'; text: string}>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateRegister = (): TFieldErrors => {
    const errors: TFieldErrors = {};
    if (!EMAIL_REGEX.test(email)) errors.email = 'Enter a valid email address';
    if (pass.length < MIN_PASSWORD_LENGTH)
      errors.pass = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    return errors;
  };

  const validateOtp = (): TFieldErrors => {
    const errors: TFieldErrors = {};
    if (!/^\d+$/.test(otp) || otp.length !== OTP_LENGTH)
      errors.otp = `Enter the ${OTP_LENGTH}-digit code`;
    return errors;
  };

  const handleRegisterSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setServerMessage(undefined);

    const errors = validateRegister();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email, pass}),
      });
      const data = await response.json();

      if (response.ok) {
        setServerMessage(undefined);
        setStep('verify-otp');
      } else {
        setServerMessage({type: 'error', text: data.message ?? 'Registration failed'});
      }
    } catch {
      setServerMessage({type: 'error', text: 'Something went wrong. Please try again.'});
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setServerMessage(undefined);

    const errors = validateOtp();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email, otp}),
      });
      const data = await response.json();

      if (response.ok) {
        setServerMessage({type: 'success', text: data.message});
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } else {
        setServerMessage({type: 'error', text: data.message ?? 'Verification failed'});
      }
    } catch {
      setServerMessage({type: 'error', text: 'Something went wrong. Please try again.'});
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        {step === 'register' ? (
          <>
            <CardHeader>
              <CardTitle>Create an account</CardTitle>
              <CardDescription>Sign up to access your dashboard</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-4" onSubmit={handleRegisterSubmit} noValidate>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email" className="text-sm font-medium">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="you@example.com"
                  />
                  {fieldErrors.email && (
                    <p className="text-sm text-destructive">{fieldErrors.email}</p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="pass" className="text-sm font-medium">
                    Password
                  </label>
                  <input
                    id="pass"
                    type="password"
                    autoComplete="new-password"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="At least 8 characters"
                  />
                  {fieldErrors.pass && (
                    <p className="text-sm text-destructive">{fieldErrors.pass}</p>
                  )}
                </div>

                {serverMessage && (
                  <p
                    className={
                      serverMessage.type === 'success'
                        ? 'text-sm text-green-600'
                        : 'text-sm text-destructive'
                    }
                  >
                    {serverMessage.text}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating account…' : 'Create account'}
                </button>
              </form>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Verify your email</CardTitle>
              <CardDescription>
                Enter the {OTP_LENGTH}-digit code sent to {email}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-4" onSubmit={handleOtpSubmit} noValidate>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="otp" className="text-sm font-medium">
                    Verification code
                  </label>
                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={OTP_LENGTH}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="rounded-md border border-input bg-transparent px-3 py-2 text-center text-lg tracking-widest outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="123456"
                  />
                  {fieldErrors.otp && <p className="text-sm text-destructive">{fieldErrors.otp}</p>}
                </div>

                {serverMessage && (
                  <p
                    className={
                      serverMessage.type === 'success'
                        ? 'text-sm text-green-600'
                        : 'text-sm text-destructive'
                    }
                  >
                    {serverMessage.text}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {isSubmitting ? 'Verifying…' : 'Verify'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStep('register');
                    setServerMessage(undefined);
                    setFieldErrors({});
                  }}
                  className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                >
                  Back to registration
                </button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
