import { LifecycleStage, PricingModel, Prisma } from "@prisma/client";

import {
  CANCELLATION_NOTICE_DAYS,
  CLOSED_STAGES,
  INVOICE_ONLY_MONTHLY_FEE,
  TRANSACTION_PRICE_TIERS,
  TRIAL_LENGTH_DAYS,
} from "@/lib/constants";

export function addDays(from: Date, days: number) {
  const result = new Date(from);
  result.setDate(result.getDate() + days);
  return result;
}

export function isClosedStage(stage: LifecycleStage) {
  return CLOSED_STAGES.includes(stage);
}

type LifecycleTimestamps = {
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  convertedAt: Date | null;
  cancellationNoticeAt: Date | null;
  churnedAt: Date | null;
  closedAt: Date | null;
};

/// Derive the date fields implied by a lifecycle stage so the timeline stays
/// consistent no matter which screen moved the customer. Existing dates are
/// never overwritten — entering trial twice keeps the original trial window.
export function lifecycleTimestampsFor(
  stage: LifecycleStage,
  current: Partial<LifecycleTimestamps> = {},
  now: Date = new Date(),
): Partial<LifecycleTimestamps> {
  const patch: Partial<LifecycleTimestamps> = {};

  if (stage === LifecycleStage.TRIAL_ACTIVE_500) {
    if (!current.trialStartedAt) {
      patch.trialStartedAt = now;
    }

    if (!current.trialEndsAt) {
      patch.trialEndsAt = addDays(current.trialStartedAt ?? now, TRIAL_LENGTH_DAYS);
    }
  }

  if (stage === LifecycleStage.CUSTOMER_ACTIVE_700 && !current.convertedAt) {
    patch.convertedAt = now;
  }

  if (stage === LifecycleStage.CANCELLATION_NOTICE_800 && !current.cancellationNoticeAt) {
    patch.cancellationNoticeAt = now;
  }

  if (stage === LifecycleStage.CHURNED_900 && !current.churnedAt) {
    patch.churnedAt = now;
  }

  if (isClosedStage(stage)) {
    if (!current.closedAt) {
      patch.closedAt = now;
    }
  } else {
    // Reopening a customer clears the closing date so reports stay truthful.
    patch.closedAt = null;
  }

  return patch;
}

/// The date the contract actually ends once notice has been given: 30 days
/// after the notice, per the SaleVali terms.
export function contractEndDate(cancellationNoticeAt: Date | null | undefined) {
  return cancellationNoticeAt ? addDays(cancellationNoticeAt, CANCELLATION_NOTICE_DAYS) : null;
}

/// Monthly revenue SaleVali would earn from this account, following the public
/// pricing: a flat fee for invoice-only usage, tiered per-transaction pricing
/// for API-connected accounts.
export function estimateMonthlyRevenue(
  pricingModel: PricingModel,
  monthlyTransactions: number | null | undefined,
) {
  if (pricingModel === PricingModel.INVOICE_ONLY_FIXED) {
    return INVOICE_ONLY_MONTHLY_FEE;
  }

  if (pricingModel !== PricingModel.API_TRANSACTION_TIERED) {
    return null;
  }

  const transactions = monthlyTransactions ?? 0;

  if (transactions <= 0) {
    return 0;
  }

  let remaining = transactions;
  let previousCeiling = 0;
  let total = 0;

  for (const tier of TRANSACTION_PRICE_TIERS) {
    const tierSize = tier.upTo - previousCeiling;
    const billed = Math.min(remaining, tierSize);

    total += billed * tier.pricePerTransaction;
    remaining -= billed;
    previousCeiling = tier.upTo;

    if (remaining <= 0) {
      break;
    }
  }

  return Math.round(total * 100) / 100;
}

/// Prisma Decimal values are objects; normalise them for arithmetic and display.
export function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? null : Number(value.toString());
}

export function daysUntil(date: Date | null | undefined, now: Date = new Date()) {
  if (!date) {
    return null;
  }

  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatCurrency(
  amount: number | null | undefined,
  currency = "EUR",
  locale = "de-DE",
) {
  if (amount === null || amount === undefined) {
    return "—";
  }

  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}
