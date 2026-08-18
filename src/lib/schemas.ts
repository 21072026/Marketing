import {
  CampaignStatus,
  CustomerLocale,
  CustomerSource,
  IntegrationChannel,
  IntegrationStatus,
  InteractionType,
  LifecycleStage,
  PricingModel,
  SepaMandateStatus,
  UserRole,
} from "@prisma/client";
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

const optionalInteger = z.preprocess((value) => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}, z.number().int().nonnegative().optional());

const optionalDate = z.preprocess((value) => {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  return new Date(value);
}, z.date().optional());

const optionalBoolean = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    const normalised = value.trim().toLowerCase();

    if (normalised === "") {
      return undefined;
    }

    return ["on", "true", "1", "yes"].includes(normalised);
  }

  return undefined;
}, z.boolean().optional());

export const customerCreateSchema = z.object({
  companyName: z.string().trim().min(2),
  legalName: optionalTrimmedString,
  website: optionalTrimmedString,
  country: z
    .preprocess(
      (value) => (typeof value === "string" && value.trim() !== "" ? value.trim().toUpperCase() : undefined),
      z.string().length(2).optional(),
    )
    .default("DE"),
  city: optionalTrimmedString,
  vatId: optionalTrimmedString,
  locale: z.nativeEnum(CustomerLocale).default(CustomerLocale.DE),
  industry: optionalTrimmedString,
  stage: z.nativeEnum(LifecycleStage).default(LifecycleStage.PROSPECT_100),
  source: z.nativeEnum(CustomerSource).default(CustomerSource.OTHER),
  pricingModel: z.nativeEnum(PricingModel).default(PricingModel.UNDECIDED),
  monthlyTransactions: optionalInteger,
  mrr: optionalNumber,
  currency: z
    .preprocess(
      (value) => (typeof value === "string" && value.trim() !== "" ? value.trim().toUpperCase() : undefined),
      z.string().length(3).optional(),
    )
    .default("EUR"),
  trialStartedAt: optionalDate,
  trialEndsAt: optionalDate,
  sepaMandateStatus: z.nativeEnum(SepaMandateStatus).default(SepaMandateStatus.NONE),
  assignedToId: optionalTrimmedString,
  campaignId: optionalTrimmedString,
  notes: optionalTrimmedString,
});

export const customerUpdateSchema = customerCreateSchema.partial().extend({
  convertedAt: optionalDate,
  cancellationNoticeAt: optionalDate,
  churnedAt: optionalDate,
  closedAt: optionalDate,
});

/// Stage moves get their own endpoint so every transition is written to the
/// StageChange audit trail with an optional reason.
export const customerStageChangeSchema = z.object({
  stage: z.nativeEnum(LifecycleStage),
  note: optionalTrimmedString,
});

export const contactCreateSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: optionalTrimmedString.pipe(z.string().email().optional()),
  phone: optionalTrimmedString,
  title: optionalTrimmedString,
  customerId: optionalTrimmedString,
  isPrimary: optionalBoolean.pipe(z.boolean().default(false)),
  notes: optionalTrimmedString,
});

export const integrationUpsertSchema = z.object({
  channel: z.nativeEnum(IntegrationChannel),
  status: z.nativeEnum(IntegrationStatus).default(IntegrationStatus.INTERESTED),
  notes: optionalTrimmedString,
});

export const interactionCreateSchema = z.object({
  type: z.nativeEnum(InteractionType).default(InteractionType.NOTE),
  subject: optionalTrimmedString,
  body: optionalTrimmedString,
  happenedAt: optionalDate,
});

export const taskCreateSchema = z.object({
  title: z.string().trim().min(2),
  description: optionalTrimmedString,
  dueDate: optionalDate,
  assignedToId: optionalTrimmedString,
});

export const taskUpdateSchema = z.object({
  title: optionalTrimmedString,
  description: optionalTrimmedString,
  dueDate: optionalDate,
  assignedToId: optionalTrimmedString,
  done: optionalBoolean,
});

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(2),
  description: optionalTrimmedString,
  status: z.nativeEnum(CampaignStatus).default(CampaignStatus.DRAFT),
  startDate: optionalDate,
  endDate: optionalDate,
  budget: optionalNumber,
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
