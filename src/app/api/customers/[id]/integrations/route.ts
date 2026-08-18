import { NextRequest, NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { integrationUpsertSchema } from "@/lib/schemas";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const integrations = await prisma.customerIntegration.findMany({
    where: { customerId: id },
    orderBy: { channel: "asc" },
  });

  return NextResponse.json(integrations);
}

/// A customer has at most one record per channel, so posting the same channel
/// twice updates its status instead of creating a duplicate row.
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const parsed = integrationUpsertSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true } });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const { channel, status, notes } = parsed.data;

  const integration = await prisma.customerIntegration.upsert({
    where: { customerId_channel: { customerId: id, channel } },
    update: { status, notes },
    create: { customerId: id, channel, status, notes },
  });

  return NextResponse.json(integration);
}
