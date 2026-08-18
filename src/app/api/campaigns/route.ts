import { NextRequest, NextResponse } from "next/server";
import { CampaignStatus } from "@prisma/client";

import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { campaignCreateSchema } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status") as CampaignStatus | null;
  const campaigns = await prisma.campaign.findMany({
    where: status && Object.values(CampaignStatus).includes(status) ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { customers: true },
      },
    },
  });

  return NextResponse.json(campaigns);
}

export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = campaignCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      ...parsed.data,
      createdById: session.user.id,
    },
  });

  return NextResponse.json(campaign, { status: 201 });
}
