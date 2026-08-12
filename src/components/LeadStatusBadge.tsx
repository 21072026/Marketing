import { LeadStatus } from "@prisma/client";
import clsx from "clsx";

import { LEAD_STATUS_LABELS } from "@/lib/constants";

const statusClasses: Record<LeadStatus, string> = {
  LEAD_NEW_100: "bg-slate-100 text-slate-700",
  LEAD_CONTACTED_200: "bg-sky-100 text-sky-700",
  LEAD_QUALIFIED_300: "bg-violet-100 text-violet-700",
  LEAD_PROPOSAL_SENT_400: "bg-amber-100 text-amber-700",
  LEAD_NEGOTIATION_500: "bg-orange-100 text-orange-700",
  LEAD_WON_600: "bg-emerald-100 text-emerald-700",
  LEAD_LOST_700: "bg-rose-100 text-rose-700",
  LEAD_UNQUALIFIED_800: "bg-zinc-200 text-zinc-700",
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
        statusClasses[status],
      )}
    >
      {LEAD_STATUS_LABELS[status]}
    </span>
  );
}
