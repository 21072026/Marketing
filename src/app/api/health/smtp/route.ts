import { NextResponse } from "next/server";

import { maySeeHealthDetail } from "@/lib/health";
import { verifySmtpConnection } from "@/lib/mailer";

// SMTP connectivity check, as its own route rather than a `?smtp=1` flag on
// /api/health.
//
// WHY IT IS SEPARATE: opening an SMTP session is the most side-effecting thing
// any health probe does here, and the result carries the provider's error text —
// a free probe of the mail configuration for whoever can trigger it. As a query
// parameter, that action was guarded by user-supplied input, which is both the
// pattern CodeQL flags and a fair description of the risk. As its own route the
// only gate is authorization: no caller-provided value decides whether the
// connection happens.
//
// It is also kept off /api/health because the deploy script polls that endpoint
// in a retry loop; nobody wants thirty SMTP handshakes per deploy.
//
// Invitations are the one thing this app sends, and they fail silently from the
// recipient's side, so this is worth having.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await maySeeHealthDetail(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await verifySmtpConnection();

  return NextResponse.json(
    {
      smtp: result.ok ? "ok" : "error",
      ...(result.error ? { error: result.error } : {}),
      timestamp: new Date().toISOString(),
    },
    { status: result.ok ? 200 : 503 },
  );
}
