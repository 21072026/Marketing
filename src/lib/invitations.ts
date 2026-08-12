import { UserRole } from "@prisma/client";
import crypto from "crypto";

import { sendInvitationEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";

export async function createInvitation({
  email,
  role,
  createdById,
}: {
  email: string;
  role: UserRole;
  createdById: string;
}) {
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (existingUser) {
    throw new Error("A user with this email already exists.");
  }

  await prisma.invitationToken.deleteMany({
    where: {
      email: normalizedEmail,
      usedAt: null,
    },
  });

  const token = crypto.randomBytes(32).toString("hex");

  const invitation = await prisma.invitationToken.create({
    data: {
      email: normalizedEmail,
      role,
      token,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      createdById,
    },
  });

  const registrationUrl = await sendInvitationEmail({
    to: normalizedEmail,
    role,
    token,
  });

  return { invitation, registrationUrl };
}
