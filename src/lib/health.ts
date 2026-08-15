import { UserRole } from "@prisma/client";
import { timingSafeEqual } from "crypto";

import { getServerAuthSession } from "@/lib/auth";

/**
 * Whether this caller may see health *detail* — version, git sha, subsystem
 * status — or run a subsystem check.
 *
 * Liveness stays public: a monitor cannot log in. The detail is a different
 * matter, being a ready-made answer to "which CVEs apply to this deployment?".
 * It is released only to an admin session or a caller holding HEALTH_TOKEN.
 *
 * With HEALTH_TOKEN unset the health endpoints stay fully public. That is
 * deliberate rather than lazy: the deploy gate reads `sha` from /api/health, and
 * defaulting to closed would blind it the moment this shipped, before anyone had
 * a chance to configure a token.
 */
export async function maySeeHealthDetail(request: Request): Promise<boolean> {
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
