import { LeadStatus, Prisma, UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { leadUpdateSchema } from "@/lib/schemas";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      contact: true,
      campaign: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      interactions: {
        orderBy: { happenedAt: "desc" },
      },
      tasks: {
        orderBy: [{ done: "asc" }, { dueDate: "asc" }],
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json(lead);
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
  const parsed = leadUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data: Prisma.LeadUpdateInput = { ...parsed.data };
  const finalStatus = parsed.data.status;
  const isClosedStatus =
    finalStatus === LeadStatus.LEAD_WON_600 ||
    finalStatus === LeadStatus.LEAD_LOST_700 ||
    finalStatus === LeadStatus.LEAD_UNQUALIFIED_800;

  if (isClosedStatus && !data.closedAt) {
    data.closedAt = new Date();
  }

  if (finalStatus && !isClosedStatus) {
    data.closedAt = null;
  }

  const lead = await prisma.lead.update({
    where: { id },
    data,
    include: {
      contact: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      campaign: true,
    },
  });

  return NextResponse.json(lead);
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
    await prisma.lead.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    throw error;
  }

  return NextResponse.json({ ok: true });
}
