import { CampaignStatus, LeadStatus, UserRole } from "@prisma/client";

export const LEAD_STATUS_ORDER: LeadStatus[] = [
  LeadStatus.LEAD_NEW_100,
  LeadStatus.LEAD_CONTACTED_200,
  LeadStatus.LEAD_QUALIFIED_300,
  LeadStatus.LEAD_PROPOSAL_SENT_400,
  LeadStatus.LEAD_NEGOTIATION_500,
  LeadStatus.LEAD_WON_600,
  LeadStatus.LEAD_LOST_700,
  LeadStatus.LEAD_UNQUALIFIED_800,
];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  LEAD_NEW_100: "New",
  LEAD_CONTACTED_200: "Contacted",
  LEAD_QUALIFIED_300: "Qualified",
  LEAD_PROPOSAL_SENT_400: "Proposal Sent",
  LEAD_NEGOTIATION_500: "Negotiation",
  LEAD_WON_600: "Won",
  LEAD_LOST_700: "Lost",
  LEAD_UNQUALIFIED_800: "Unqualified",
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
