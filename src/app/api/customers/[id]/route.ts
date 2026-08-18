import { Prisma, UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { customerUpdateSchema } from "@/lib/schemas";
import { lifecycleTimestampsFor } from "@/lib/lifecycle";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      campaign: true,
      contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] },
      integrations: { orderBy: { channel: "asc" } },
      interactions: { orderBy: { happenedAt: "desc" } },
      tasks: { orderBy: [{ done: "asc" }, { dueDate: "asc" }] },
      stageHistory: { orderBy: { changedAt: "desc" } },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  return NextResponse.json(customer);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const parsed = customerUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.customer.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const data: Prisma.CustomerUpdateInput = { ...parsed.data };
  const nextStage = parsed.data.stage;

  if (nextStage) {
    // Merge the caller's explicit dates over the current record before deriving,
    // so an operator can backdate a trial in the same request that moves stage.
    Object.assign(
      data,
      lifecycleTimestampsFor(nextStage, {
        trialStartedAt: parsed.data.trialStartedAt ?? existing.trialStartedAt,
        trialEndsAt: parsed.data.trialEndsAt ?? existing.trialEndsAt,
        convertedAt: parsed.data.convertedAt ?? existing.convertedAt,
        cancellationNoticeAt: parsed.data.cancellationNoticeAt ?? existing.cancellationNoticeAt,
        churnedAt: parsed.data.churnedAt ?? existing.churnedAt,
        closedAt: parsed.data.closedAt ?? existing.closedAt,
      }),
    );

    if (nextStage !== existing.stage) {
      data.stageHistory = {
        create: {
          fromStage: existing.stage,
          toStage: nextStage,
          createdById: session.user.id,
        },
      };
    }
  }

  const customer = await prisma.customer.update({
    where: { id },
    data,
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      campaign: { select: { id: true, name: true, status: true } },
      integrations: true,
    },
  });

  return NextResponse.json(customer);
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.MANAGER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    await prisma.customer.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    throw error;
  }

  return NextResponse.json({ ok: true });
}
