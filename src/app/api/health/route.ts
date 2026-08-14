import { UserRole } from "@prisma/client";
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { verifySmtpConnection } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { APP_ENV, APP_VERSION, GIT_SHA } from "@/lib/version";

// Liveness / readiness probe for uptime monitors and, more importantly, for the
// deploy pipeline: `infra/deploy-prod.sh` and the drift gate in
// .github/workflows/deploy-prod.yml read `sha` from here to decide what is
// actually live. Always cheap by default; pass ?db=1 to also verify database
// connectivity, or ?smtp=1 to verify SMTP (no message is sent). Never touches
// or mutates domain data.
export const dynamic = "force-dynamic";

/**
 * Whether this caller may see the detailed fields.
 *
 * Liveness stays public — a monitor cannot log in. The detail (version, git
 * sha, subsystem status) is a ready-made answer to "which CVEs apply to this
 * deployment?", so it is released only to an admin session or a caller holding
 * HEALTH_TOKEN.
 *
 * With HEALTH_TOKEN unset the endpoint stays fully public. That is deliberate:
 * the deploy gate reads `sha` from here, and defaulting to closed would blind
 * it before anyone had configured a token.
 */
async function maySeeDetail(request: Request): Promise<boolean> {
  const expected = process.env.HEALTH_TOKEN;

  if (!expected) {
    return true;
  }

  const got = request.headers.get("x-health-token") ?? "";

  try {
    if (got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
      return true;
    }
  } catch {
    // Fall through to the session check.
  }

  const session = await getServerAuthSession();
  return session?.user.role === UserRole.ADMIN;
}

export async function GET(request: Request) {
  const started = Date.now();
  const params = new URL(request.url).searchParams;

  let db: "ok" | "error" | "skipped" = "skipped";

  if (params.get("db") === "1") {
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = "ok";
    } catch {
      db = "error";
    }
  }

  let smtp: "ok" | "error" | "skipped" = "skipped";
  let smtpError: string | undefined;

  if (params.get("smtp") === "1") {
    const result = await verifySmtpConnection();
    smtp = result.ok ? "ok" : "error";
    smtpError = result.error;
  }

  const healthy = db !== "error" && smtp !== "error";
  const status = healthy ? "ok" : "degraded";

  // An anonymous caller learns whether the app is up, and nothing else. The
  // status code still separates healthy from degraded, which is all an uptime
  // monitor acts on.
  if (!(await maySeeDetail(request))) {
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
      smtp,
      ...(smtpError ? { smtpError } : {}),
      uptimeMs: Math.round(process.uptime() * 1000),
      responseMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
