import { NextRequest, NextResponse } from "next/server";
import { getIndexNowKey } from "@/lib/seo/indexnow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** IndexNow verification at /{key}.txt (rewritten from next.config). */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key: keySegment } = await ctx.params;
  const configuredKey = getIndexNowKey();

  if (!configuredKey || keySegment !== configuredKey) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new NextResponse(configuredKey, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
