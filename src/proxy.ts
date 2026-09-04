import {NextRequest, NextResponse} from 'next/server';
import {jwtVerify} from 'jose';

export async function proxy(request: NextRequest) {
  const authToken = await request.headers.get('authorization')?.replace('Bearer ', '');

  // 2. Redirect to login if no token is found
  if (!authToken) {
    return NextResponse.json(
      {
        message: 'Unauthorized access',
      },
      {status: 401}
    );
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);

    const verifiedJwt = await jwtVerify(authToken, secret);

    const requestHeaders = new Headers(request.headers);
    const userId = (verifiedJwt.payload.userId as string) || verifiedJwt.payload.sub;

    if (!userId) {
      return NextResponse.json(
        {
          message: 'Unauthorized access',
        },
        {status: 401}
      );
    }

    requestHeaders.set('x-user-id', userId);
    return NextResponse.next({
      request: {headers: requestHeaders},
    });
  } catch {
    return NextResponse.json(
      {
        message: 'Unauthorized access',
      },
      {status: 401}
    );
  }
}

export const config = {
  // auth/logout is excluded because it authenticates off the refreshToken cookie and
  // never reads x-user-id — and the client clears the access token before calling it.
  matcher: ['/api/((?!auth/login|auth/register|auth/verify-otp|auth/refresh|auth/logout).*)'],
};
