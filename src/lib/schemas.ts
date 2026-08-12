import { CampaignStatus, LeadStatus, UserRole } from "@prisma/client";
import { z } from "zod";

const optionalTrimmedString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const optionalNumber = z.preprocess((value) => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}, z.number().nonnegative().optional());

const optionalDate = z.preprocess((value) => {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  return new Date(value);
}, z.date().optional());

export const contactCreateSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: optionalTrimmedString.pipe(z.string().email().optional()),
  phone: optionalTrimmedString,
  company: optionalTrimmedString,
  title: optionalTrimmedString,
  notes: optionalTrimmedString,
});

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(2),
  description: optionalTrimmedString,
  status: z.nativeEnum(CampaignStatus).default(CampaignStatus.DRAFT),
  startDate: optionalDate,
  endDate: optionalDate,
  budget: optionalNumber,
});

export const leadCreateSchema = z.object({
  title: z.string().trim().min(2),
  contactId: optionalTrimmedString,
  status: z.nativeEnum(LeadStatus).default(LeadStatus.LEAD_NEW_100),
  assignedToId: optionalTrimmedString,
  campaignId: optionalTrimmedString,
  value: optionalNumber,
  currency: z.string().trim().length(3).default("USD"),
  notes: optionalTrimmedString,
});

export const leadUpdateSchema = leadCreateSchema.partial().extend({
  closedAt: optionalDate,
});

export const inviteUserSchema = z.object({
  email: z.string().trim().email(),
  role: z.nativeEnum(UserRole),
});

export const registerUserSchema = z.object({
  token: z.string().trim().min(10),
  name: z.string().trim().min(2),
  password: z.string().min(8),
});
