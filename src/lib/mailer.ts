import { UserRole } from "@prisma/client";
import nodemailer from "nodemailer";

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "0");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS must be configured.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
}

export async function sendInvitationEmail({
  to,
  role,
  token,
}: {
  to: string;
  role: UserRole;
  token: string;
}) {
  const from = process.env.SMTP_FROM;
  const baseUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

  if (!from) {
    throw new Error("SMTP_FROM must be configured.");
  }

  const registrationUrl = `${baseUrl}/register?token=${token}`;
  const transporter = getTransporter();

  await transporter.sendMail({
    from,
    to,
    subject: "You have been invited to Marketing CRM",
    text: `You have been invited to Marketing CRM as a ${role}. Complete your registration here: ${registrationUrl}`,
    html: `<p>You have been invited to <strong>Marketing CRM</strong> as a <strong>${role}</strong>.</p><p><a href="${registrationUrl}">Complete your registration</a></p>`,
  });

  return registrationUrl;
}
