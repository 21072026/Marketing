import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { contactCreateSchema } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const customerId = request.nextUrl.searchParams.get("customerId")?.trim();

  const contacts = await prisma.contact.findMany({
    where: customerId ? { customerId } : undefined,
    orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
    include: {
      customer: { select: { id: true, companyName: true, stage: true } },
    },
  });

  return NextResponse.json(contacts);
}

export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = contactCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const contact = await prisma.contact.create({
      data: {
        ...parsed.data,
        createdById: session.user.id,
      },
      include: {
        customer: { select: { id: true, companyName: true, stage: true } },
      },
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json({ error: "A contact with this email already exists" }, { status: 409 });
      }

      if (error.code === "P2003" || error.code === "P2025") {
        return NextResponse.json({ error: "Customer not found" }, { status: 400 });
      }
    }

    throw error;
  }
}
