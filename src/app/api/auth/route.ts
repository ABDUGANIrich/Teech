import { NextRequest, NextResponse } from "next/server";
import { authAction } from "@/lib/server/auth-actions";
import { configured } from "@/lib/server/config";
import { AppError } from "@/lib/domain";
export async function POST(req: NextRequest) {
  const origin = new URL(process.env.APP_URL || req.url).origin;
  const headers = { "Cache-Control": "private, no-store" };
  if (req.headers.get("origin") !== origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403, headers },
    );
  if (!configured())
    return NextResponse.json(
      {
        error:
          "Accounts are unavailable. You can still try the sample preview.",
      },
      { status: 503, headers },
    );
  try {
    const raw = await req.text();
    if (raw.length > 2000)
      throw new AppError("This request is too large.", 413);
    return NextResponse.json(await authAction(JSON.parse(raw), origin), {
      headers,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : "Use a valid email and a password of 8–128 characters where required.",
      },
      { status: e instanceof AppError ? e.status : 400, headers },
    );
  }
}
