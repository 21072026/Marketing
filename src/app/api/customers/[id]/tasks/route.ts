import { NextRequest, NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { taskCreateSchema } from "@/lib/schemas";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const tasks = await prisma.task.findMany({
    where: { customerId: id },
    orderBy: [{ done: "asc" }, { dueDate: "asc" }],
    include: { assignedTo: { select: { id: true, name: true } } },
  });

  return NextResponse.json(tasks);
}

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
  const parsed = taskCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true } });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const task = await prisma.task.create({
    data: {
      ...parsed.data,
      customerId: id,
      createdById: session.user.id,
    },
    include: { assignedTo: { select: { id: true, name: true } } },
  });

  return NextResponse.json(task, { status: 201 });
}
