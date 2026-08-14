import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

/**
 * Direct DB access for E2E setup and teardown.
 *
 * Specs create their own fixtures and remove them again, so the suite is
 * self-contained: it can run against a throwaway CI database or a long-lived
 * preview environment without leaving rows behind that later assertions
 * ("this company is not in the list") would trip over.
 */
export const prisma = new PrismaClient();

/// Unique per run, so a re-run never collides with fixtures from a previous one.
export function uniqueName(prefix: string) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

export function uniqueEmail(prefix: string) {
  return `${uniqueName(prefix)}@e2e.local`;
}

/**
 * Delete every customer whose company name starts with `prefix`, along with the
 * rows that hang off it.
 *
 * Interactions, tasks, integrations and stage history cascade from Customer, but
 * contacts are deliberately `onDelete: SetNull` in the schema (losing a customer
 * must not silently delete the people), so they are removed explicitly here.
 */
export async function cleanupCustomers(prefix: string) {
  const customers = await prisma.customer.findMany({
    where: { companyName: { startsWith: prefix } },
    select: { id: true },
  });

  if (customers.length === 0) {
    return;
  }

  const ids = customers.map((customer) => customer.id);

  await prisma.contact.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
}

export async function cleanupContacts(emailPrefix: string) {
  await prisma.contact.deleteMany({ where: { email: { startsWith: emailPrefix } } });
}
