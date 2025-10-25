import { NextResponse } from "next/server";
import { parseCollectionCsvText } from "@/lib/csv/collection";

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let text = "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") {
        return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
      }
      const buf = Buffer.from(await (file as any).arrayBuffer());
      text = buf.toString("utf8");
    } else {
      const body = await req.json().catch(() => ({}));
      text = body?.text ?? "";
    }

    if (!text || typeof text !== "string") {
      return NextResponse.json({ ok: false, error: "Missing CSV text" }, { status: 400 });
    }

    const { rows, report } = parseCollectionCsvText(text);
    return NextResponse.json({ ok: true, rows, report });
  } catch (e:any) {
    console.error("parse-csv error", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "parse-csv error" }, { status: 500 });
  }
}
