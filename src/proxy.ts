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
  } catch (_error) {
    return NextResponse.json(
      {
        message: 'Unauthorized access',
      },
      {status: 401}
    );
  }
}

export const config = {
  matcher: ['/api/((?!auth/login|auth/register|auth/verify-otp|auth/refresh).*)'],
};
