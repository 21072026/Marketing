import { LeadStatus } from "@prisma/client";
import Link from "next/link";

import { LeadStatusBadge } from "@/components/LeadStatusBadge";

type LeadCardProps = {
  lead: {
    id: string;
    title: string;
    status: LeadStatus;
    currency: string;
    value: { toString(): string } | null;
    updatedAt: Date;
    contact: {
      firstName: string;
      lastName: string;
      company: string | null;
    } | null;
    campaign: {
      name: string;
    } | null;
    assignedTo: {
      name: string;
    } | null;
  };
};

export function LeadCard({ lead }: LeadCardProps) {
  const contactName = lead.contact
    ? `${lead.contact.firstName} ${lead.contact.lastName}`.trim()
    : "Unassigned contact";

  return (
    <Link
      className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
      href={`/dashboard/leads/${lead.id}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold text-slate-900">{lead.title}</h3>
            <LeadStatusBadge status={lead.status} />
          </div>
          <p className="text-sm text-slate-500">
            {contactName}
            {lead.contact?.company ? ` · ${lead.contact.company}` : ""}
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            <span>Campaign: {lead.campaign?.name ?? "None"}</span>
            <span>Owner: {lead.assignedTo?.name ?? "Unassigned"}</span>
            <span>Updated: {lead.updatedAt.toLocaleDateString()}</span>
          </div>
        </div>
        <div className="text-sm font-semibold text-slate-900">
          {lead.value ? `${lead.currency} ${lead.value.toString()}` : "No value"}
        </div>
      </div>
    </Link>
  );
}
