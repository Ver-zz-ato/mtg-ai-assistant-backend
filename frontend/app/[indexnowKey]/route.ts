import { NextRequest, NextResponse } from "next/server";
import { getIndexNowKey } from "@/lib/seo/indexnow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ indexnowKey: string }> }) {
  const { indexnowKey } = await ctx.params;
  const key = getIndexNowKey();

  if (!key || indexnowKey !== `${key}.txt`) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new NextResponse(key, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
