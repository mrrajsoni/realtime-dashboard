import {redisClient} from '@/lib/redisClientForClient';
import {NextRequest, NextResponse} from 'next/server';

export async function POST(request: NextRequest) {
  const headers = request.headers;
  const userId = headers.get('x-user-id');

  if (!userId) {
    return NextResponse.json(
      {
        message: 'Unauthorized access detected',
      },
      {status: 401}
    );
  }

  try {
    let ticket = crypto.randomUUID();
    let ok = await redisClient.set(`ws:ticket:${ticket}`, userId, 'EX', 10, 'NX');
    if (!ok) {
      ticket = crypto.randomUUID();
      ok = await redisClient.set(`ws:ticket:${ticket}`, userId, 'EX', 10, 'NX');
    }
    if (!ok) return NextResponse.json({message: 'Unable to create ticket'}, {status: 503});
    return NextResponse.json({ticket});
  } catch {
    return NextResponse.json({message: 'Ticket service unavailable'}, {status: 503});
  }
}
