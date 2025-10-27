export const runtime = 'nodejs';
export const maxDuration = 600;
export const dynamic = 'force-dynamic';

export async function POST() {
  return new Response(JSON.stringify({ok:true, route:'/api/test-long-job', method:'POST'}), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

export async function GET() {
  return new Response(JSON.stringify({ok:true, route:'/api/test-long-job', method:'GET'}), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

