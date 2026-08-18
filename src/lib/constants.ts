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

/// The SaleVali acquisition funnel, in the order a customer moves through it.
export const LIFECYCLE_STAGE_ORDER: LifecycleStage[] = [
  LifecycleStage.PROSPECT_100,
  LifecycleStage.CONTACTED_200,
  LifecycleStage.DEMO_SCHEDULED_300,
  LifecycleStage.DEMO_COMPLETED_400,
  LifecycleStage.TRIAL_ACTIVE_500,
  LifecycleStage.TRIAL_EXPIRED_600,
  LifecycleStage.CUSTOMER_ACTIVE_700,
  LifecycleStage.CANCELLATION_NOTICE_800,
  LifecycleStage.CHURNED_900,
  LifecycleStage.LOST_950,
  LifecycleStage.DISQUALIFIED_990,
];

export const LIFECYCLE_STAGE_LABELS: Record<LifecycleStage, string> = {
  PROSPECT_100: "Prospect",
  CONTACTED_200: "Contacted",
  DEMO_SCHEDULED_300: "Demo scheduled",
  DEMO_COMPLETED_400: "Demo completed",
  TRIAL_ACTIVE_500: "Trial active",
  TRIAL_EXPIRED_600: "Trial expired",
  CUSTOMER_ACTIVE_700: "Paying customer",
  CANCELLATION_NOTICE_800: "Cancellation notice",
  CHURNED_900: "Churned",
  LOST_950: "Lost",
  DISQUALIFIED_990: "Disqualified",
};

/// Stages where the customer is neither a paying customer nor closed out —
/// the part of the funnel the marketing team actively works.
export const OPEN_FUNNEL_STAGES: LifecycleStage[] = [
  LifecycleStage.PROSPECT_100,
  LifecycleStage.CONTACTED_200,
  LifecycleStage.DEMO_SCHEDULED_300,
  LifecycleStage.DEMO_COMPLETED_400,
  LifecycleStage.TRIAL_ACTIVE_500,
  LifecycleStage.TRIAL_EXPIRED_600,
];

/// Terminal stages: the customer is no longer in play.
export const CLOSED_STAGES: LifecycleStage[] = [
  LifecycleStage.CHURNED_900,
  LifecycleStage.LOST_950,
  LifecycleStage.DISQUALIFIED_990,
];

export const CUSTOMER_SOURCE_LABELS: Record<CustomerSource, string> = {
  WEBSITE_TRIAL: "Website trial signup",
  DEMO_REQUEST: "Demo request",
  AFFILIATE: "Affiliate",
  CONSULTANT: "Consultant referral",
  REFERRAL: "Customer referral",
  MARKETPLACE: "Marketplace listing",
  OUTBOUND: "Outbound",
  ADS: "Paid ads",
  EVENT: "Event / fair",
  OTHER: "Other",
};

export const PRICING_MODEL_LABELS: Record<PricingModel, string> = {
  UNDECIDED: "Undecided",
  INVOICE_ONLY_FIXED: "Invoice only (fixed €9.90/mo)",
  API_TRANSACTION_TIERED: "API connected (tiered per transaction)",
};

export const SEPA_MANDATE_STATUS_LABELS: Record<SepaMandateStatus, string> = {
  NONE: "No mandate",
  REQUESTED: "Requested",
  ACTIVE: "Active",
  FAILED: "Failed",
};

export const CUSTOMER_LOCALE_LABELS: Record<CustomerLocale, string> = {
  DE: "Deutsch",
  EN: "English",
  TR: "Türkçe",
};

export const INTEGRATION_CHANNEL_LABELS: Record<IntegrationChannel, string> = {
  AMAZON: "Amazon",
  EBAY: "eBay",
  KAUFLAND: "Kaufland",
  OTTO: "OTTO",
  ETSY: "Etsy",
  SHOPIFY: "Shopify",
  SHOPWARE: "Shopware",
  WOOCOMMERCE: "WooCommerce",
  PRESTASHOP: "PrestaShop",
  DHL: "DHL",
  DPD: "DPD",
  GLS: "GLS",
  UPS: "UPS",
  HERMES: "Hermes",
  CUSTOM_API: "Custom API",
  OTHER: "Other",
};

/// Marketplaces and shops drive the sales pitch; shipping providers are
/// operational detail, so the UI groups them separately.
export const MARKETPLACE_CHANNELS: IntegrationChannel[] = [
  IntegrationChannel.AMAZON,
  IntegrationChannel.EBAY,
  IntegrationChannel.KAUFLAND,
  IntegrationChannel.OTTO,
  IntegrationChannel.ETSY,
];

export const SHOP_CHANNELS: IntegrationChannel[] = [
  IntegrationChannel.SHOPIFY,
  IntegrationChannel.SHOPWARE,
  IntegrationChannel.WOOCOMMERCE,
  IntegrationChannel.PRESTASHOP,
];

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  INTERESTED: "Interested",
  IN_PROGRESS: "In progress",
  CONNECTED: "Connected",
  BLOCKED: "Blocked",
};

export const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
  EMAIL: "Email",
  CALL: "Call",
  WHATSAPP: "WhatsApp",
  MEETING: "Meeting",
  DEMO: "Demo",
  ONBOARDING: "Onboarding",
  NOTE: "Note",
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  PAUSED: "Paused",
  COMPLETED: "Completed",
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  MARKETER: "Marketer",
};

export const USER_ROLE_OPTIONS = Object.values(UserRole);
export const CAMPAIGN_STATUS_OPTIONS = Object.values(CampaignStatus);
export const CUSTOMER_SOURCE_OPTIONS = Object.values(CustomerSource);
export const PRICING_MODEL_OPTIONS = Object.values(PricingModel);
export const SEPA_MANDATE_STATUS_OPTIONS = Object.values(SepaMandateStatus);
export const CUSTOMER_LOCALE_OPTIONS = Object.values(CustomerLocale);
export const INTEGRATION_CHANNEL_OPTIONS = Object.values(IntegrationChannel);
export const INTEGRATION_STATUS_OPTIONS = Object.values(IntegrationStatus);
export const INTERACTION_TYPE_OPTIONS = Object.values(InteractionType);

/// SaleVali gives every signup 30 days of free trial, with no auto-renewal.
export const TRIAL_LENGTH_DAYS = 30;

/// Contracts are cancellable by email with 30 days' notice.
export const CANCELLATION_NOTICE_DAYS = 30;

/// Tiered per-transaction pricing for API-connected accounts, in EUR.
export const TRANSACTION_PRICE_TIERS = [
  { upTo: 100, pricePerTransaction: 0.2 },
  { upTo: 1000, pricePerTransaction: 0.05 },
  { upTo: Infinity, pricePerTransaction: 0.033 },
] as const;

/// Fixed monthly fee for accounts that only issue invoices (no API connection).
export const INVOICE_ONLY_MONTHLY_FEE = 9.9;
