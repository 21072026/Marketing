import { NextRequest, NextResponse } from "next/server";
import { LeadStatus, Prisma } from "@prisma/client";

import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { leadCreateSchema } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();
  const rawStatus = request.nextUrl.searchParams.get("status");
  const status = rawStatus && Object.values(LeadStatus).includes(rawStatus as LeadStatus) ? (rawStatus as LeadStatus) : undefined;

  const where: Prisma.LeadWhereInput = {
    status,
    OR: q
      ? [
          { title: { contains: q } },
          { notes: { contains: q } },
          { contact: { is: { firstName: { contains: q } } } },
          { contact: { is: { lastName: { contains: q } } } },
          { contact: { is: { company: { contains: q } } } },
          { campaign: { is: { name: { contains: q } } } },
        ]
      : undefined,
  };

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      contact: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      campaign: true,
    },
  });

  return NextResponse.json(leads);
}

export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = leadCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const lead = await prisma.lead.create({
    data: {
      ...parsed.data,
      createdById: session.user.id,
    },
    include: {
      contact: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      campaign: true,
    },
  });

  return NextResponse.json(lead, { status: 201 });
}
