import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/domain";
import { readLearning, runTeacherAction } from "@/lib/server/teacher-service";
export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};
function failure(e: unknown) {
  return NextResponse.json(
    {
      error:
        e instanceof AppError
          ? e.message
          : e instanceof z.ZodError
            ? "Check the required fields and input limits."
            : "This request could not finish. Reload to recover saved work.",
    },
    { status: e instanceof AppError ? e.status : 400, headers },
  );
}
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(
      await readLearning(
        req.nextUrl.searchParams.get("id") || undefined,
        req.nextUrl.searchParams.get("before") || undefined,
      ),
      { headers },
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
      throw new AppError("This request must come from Teech.", 403);
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new AppError("JSON is required.", 415);
    if (Number(req.headers.get("content-length") || 0) > 120000)
      throw new AppError("This request is too large.", 413);
    const body = await req.text();
    if (body.length > 100000)
      throw new AppError("This request is too large.", 413);
    return NextResponse.json(await runTeacherAction(JSON.parse(body)), {
      headers,
    });
  } catch (e) {
    return failure(e);
  }
}
