import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/domain";
import { readData, runAction } from "@/lib/server/service";
export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
function failure(e: unknown) {
  return NextResponse.json(
    {
      error:
        e instanceof AppError
          ? e.message
          : e instanceof z.ZodError
            ? "Check the required fields and input limits."
            : "The request could not be completed. Your local writing is safe.",
    },
    { status: e instanceof AppError ? e.status : 400 },
  );
}
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(
      await readData(req.nextUrl.searchParams.get("session") || undefined),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    if (
      req.headers.get("origin") !==
      new URL(process.env.APP_URL || req.url).origin
    )
      throw new AppError(
        "This request must come from the Teech application.",
        403,
      );
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new AppError("JSON is required.", 415);
    if (Number(req.headers.get("content-length") || 0) > 120000)
      throw new AppError("This request is too large.", 413);
    const body = await req.text();
    if (body.length > 100000)
      throw new AppError("This request is too large.", 413);
    const result = await runAction(JSON.parse(body));
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
