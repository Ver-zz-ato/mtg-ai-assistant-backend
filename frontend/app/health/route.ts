// simple health endpoint for Render
export function GET() {
  return new Response("ok", { status: 200 });
}
