export async function GET() {
  const trend = Math.random() > 0.5 ? 'up' : 'down';
  const value = Math.random() * 100;
  const previousValue = trend === 'up' ? value * 0.5 : value * 1.5;
  return Response.json({value: value.toFixed(2), trend, previousValue: previousValue.toFixed(2)});
}
