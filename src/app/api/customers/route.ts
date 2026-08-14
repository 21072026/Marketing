import { NextRequest, NextResponse } from "next/server";
import { IntegrationChannel, LifecycleStage, PricingModel, Prisma } from "@prisma/client";

import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { customerCreateSchema } from "@/lib/schemas";
import { lifecycleTimestampsFor } from "@/lib/lifecycle";

const customerInclude = {
  assignedTo: { select: { id: true, name: true, email: true } },
  campaign: { select: { id: true, name: true, status: true } },
  contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] },
  integrations: true,
  _count: { select: { interactions: true, tasks: true } },
} satisfies Prisma.CustomerInclude;

export async function GET(request: NextRequest) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q")?.trim();

  const rawStage = searchParams.get("stage");
  const stage =
    rawStage && Object.values(LifecycleStage).includes(rawStage as LifecycleStage)
      ? (rawStage as LifecycleStage)
      : undefined;

  const rawPricingModel = searchParams.get("pricingModel");
  const pricingModel =
    rawPricingModel && Object.values(PricingModel).includes(rawPricingModel as PricingModel)
      ? (rawPricingModel as PricingModel)
      : undefined;

  const rawChannel = searchParams.get("channel");
  const channel =
    rawChannel && Object.values(IntegrationChannel).includes(rawChannel as IntegrationChannel)
      ? (rawChannel as IntegrationChannel)
      : undefined;

  const where: Prisma.CustomerWhereInput = {
    stage,
    pricingModel,
    integrations: channel ? { some: { channel } } : undefined,
    OR: q
      ? [
          { companyName: { contains: q } },
          { legalName: { contains: q } },
          { website: { contains: q } },
          { city: { contains: q } },
          { vatId: { contains: q } },
          { notes: { contains: q } },
          { contacts: { some: { firstName: { contains: q } } } },
          { contacts: { some: { lastName: { contains: q } } } },
          { contacts: { some: { email: { contains: q } } } },
          { campaign: { is: { name: { contains: q } } } },
        ]
      : undefined,
  };

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: customerInclude,
  });

  return NextResponse.json(customers);
}

export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = customerCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { stage, ...rest } = parsed.data;
  const timestamps = lifecycleTimestampsFor(stage, {
    trialStartedAt: rest.trialStartedAt ?? null,
    trialEndsAt: rest.trialEndsAt ?? null,
  });

  const customer = await prisma.customer.create({
    data: {
      ...rest,
      stage,
      ...timestamps,
      createdById: session.user.id,
      // Every customer starts its own audit trail, so funnel reports can
      // measure time-in-stage from the very first entry.
      stageHistory: {
        create: {
          toStage: stage,
          createdById: session.user.id,
        },
      },
    },
    include: customerInclude,
  });

  return NextResponse.json(customer, { status: 201 });
}
