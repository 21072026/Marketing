import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { createInvitation } from "@/lib/invitations";
import { inviteUserSchema } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = inviteUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await createInvitation({
      ...parsed.data,
      createdById: session.user.id,
    });
  } catch (error) {
    const isDuplicate =
      error instanceof Error && error.message.toLowerCase().includes("already");
    return NextResponse.json(
      { error: isDuplicate ? "An invitation for this email already exists." : "Failed to send invitation." },
      { status: isDuplicate ? 409 : 500 },
    );
  }

  return NextResponse.json({ message: "Invitation sent successfully." }, { status: 201 });
}
