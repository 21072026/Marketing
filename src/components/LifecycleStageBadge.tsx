import { LifecycleStage } from "@prisma/client";
import clsx from "clsx";

import { LIFECYCLE_STAGE_LABELS } from "@/lib/constants";

const stageClasses: Record<LifecycleStage, string> = {
  PROSPECT_100: "bg-slate-100 text-slate-700",
  CONTACTED_200: "bg-sky-100 text-sky-700",
  DEMO_SCHEDULED_300: "bg-indigo-100 text-indigo-700",
  DEMO_COMPLETED_400: "bg-violet-100 text-violet-700",
  TRIAL_ACTIVE_500: "bg-amber-100 text-amber-700",
  TRIAL_EXPIRED_600: "bg-orange-100 text-orange-700",
  CUSTOMER_ACTIVE_700: "bg-emerald-100 text-emerald-700",
  CANCELLATION_NOTICE_800: "bg-yellow-100 text-yellow-800",
  CHURNED_900: "bg-rose-100 text-rose-700",
  LOST_950: "bg-red-100 text-red-700",
  DISQUALIFIED_990: "bg-zinc-200 text-zinc-700",
};

export function LifecycleStageBadge({ stage }: { stage: LifecycleStage }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
        stageClasses[stage],
      )}
    >
      {LIFECYCLE_STAGE_LABELS[stage]}
    </span>
  );
}
