import { NextRequest, NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { customerStageChangeSchema } from "@/lib/schemas";
import { lifecycleTimestampsFor } from "@/lib/lifecycle";

/// Dedicated endpoint for funnel moves: updates the stage, derives the matching
/// lifecycle dates, and records the transition in the audit trail.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const parsed = customerStageChangeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.customer.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const { stage, note } = parsed.data;

  const customer = await prisma.customer.update({
    where: { id },
    data: {
      stage,
      ...lifecycleTimestampsFor(stage, existing),
      stageHistory: {
        create: {
          fromStage: existing.stage,
          toStage: stage,
          note,
          createdById: session.user.id,
        },
      },
    },
    include: {
      stageHistory: { orderBy: { changedAt: "desc" }, take: 10 },
    },
  });

  return NextResponse.json(customer);
}
