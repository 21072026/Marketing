import { NextResponse } from "next/server";

import { maySeeHealthDetail } from "@/lib/health";
import { prisma } from "@/lib/prisma";
import { APP_ENV, APP_VERSION, GIT_SHA } from "@/lib/version";

// Liveness / readiness probe for uptime monitors and, more importantly, for the
// deploy pipeline: `infra/deploy-prod.sh` and the drift gate in
// .github/workflows/deploy-prod.yml read `sha` from here to decide what is
// actually live. Always cheap by default; pass ?db=1 to also verify database
// connectivity. Never touches or mutates domain data.
//
// SMTP verification lives at /api/health/smtp instead of behind a query
// parameter here — see the note in that route.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const started = Date.now();
  const params = new URL(request.url).searchParams;

  // Authorize BEFORE doing any of the optional work. `?db=1` is a query
  // parameter, so letting it decide on its own whether the server opens a
  // database connection hands an anonymous caller a way to make this box do
  // work on demand.
  const maySeeDetail = await maySeeHealthDetail(request);

  let db: "ok" | "error" | "skipped" = "skipped";

  if (maySeeDetail && params.get("db") === "1") {
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = "ok";
    } catch {
      db = "error";
    }
  }

  const healthy = db !== "error";
  const status = healthy ? "ok" : "degraded";

  // An anonymous caller learns whether the app is up, and nothing else. The
  // status code still separates healthy from degraded, which is all an uptime
  // monitor acts on.
  if (!maySeeDetail) {
    return NextResponse.json(
      { status, timestamp: new Date().toISOString() },
      { status: healthy ? 200 : 503 },
    );
  }

  return NextResponse.json(
    {
      status,
      version: APP_VERSION,
      sha: GIT_SHA,
      env: APP_ENV,
      db,
      uptimeMs: Math.round(process.uptime() * 1000),
      responseMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
