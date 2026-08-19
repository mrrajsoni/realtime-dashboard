import {NextResponse, type NextRequest} from 'next/server';
import {Pool} from 'pg';

const pool = new Pool();

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const metricName = searchParams.get('metric');

  const metricData = await pool.query(
    `SELECT value, trend, previous_value AS "previousValue" from metrics WHERE metric_name = $1 ORDER BY created_at DESC LIMIT 1`,
    [metricName]
  );

  return NextResponse.json(metricData.rows[0]);
}
