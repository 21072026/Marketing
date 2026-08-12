import { notFound } from "next/navigation";

import { LeadStatusBadge } from "@/components/LeadStatusBadge";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatDateTime(value: Date | null | undefined) {
  if (!value) {
    return "—";
  }

  return value.toLocaleString();
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      contact: true,
      campaign: true,
      assignedTo: { select: { name: true, email: true } },
      createdBy: { select: { name: true } },
      interactions: {
        include: {
          createdBy: { select: { name: true } },
        },
        orderBy: { happenedAt: "desc" },
      },
      tasks: {
        include: {
          assignedTo: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
        orderBy: [{ done: "asc" }, { dueDate: "asc" }],
      },
    },
  });

  if (!lead) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-900">{lead.title}</h1>
              <LeadStatusBadge status={lead.status} />
            </div>
            <p className="text-sm text-slate-500">
              Created by {lead.createdBy.name} on {lead.createdAt.toLocaleDateString()}
            </p>
            <div className="grid gap-4 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">Contact</p>
                <p className="mt-1">
                  {lead.contact
                    ? `${lead.contact.firstName} ${lead.contact.lastName}`
                    : "No contact linked"}
                </p>
                <p className="text-xs text-slate-500">{lead.contact?.company ?? lead.contact?.email ?? "—"}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">Campaign</p>
                <p className="mt-1">{lead.campaign?.name ?? "No campaign"}</p>
                <p className="text-xs text-slate-500">{lead.campaign?.status ?? "—"}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">Owner</p>
                <p className="mt-1">{lead.assignedTo?.name ?? "Unassigned"}</p>
                <p className="text-xs text-slate-500">{lead.assignedTo?.email ?? "—"}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">Value</p>
                <p className="mt-1">{lead.value ? `${lead.currency} ${lead.value.toString()}` : "No value"}</p>
                <p className="text-xs text-slate-500">Closed at {formatDateTime(lead.closedAt)}</p>
              </div>
            </div>
          </div>
          <div className="max-w-sm rounded-2xl bg-slate-950 p-5 text-sm text-slate-200">
            <p className="font-semibold text-white">Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-slate-300">{lead.notes ?? "No notes have been added for this lead yet."}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Interactions</h2>
            <span className="text-sm text-slate-500">{lead.interactions.length} logged</span>
          </div>
          <div className="space-y-4">
            {lead.interactions.length > 0 ? (
              lead.interactions.map((interaction) => (
                <article key={interaction.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">{interaction.type}</p>
                      <h3 className="mt-1 text-base font-semibold text-slate-900">{interaction.subject ?? "Untitled interaction"}</h3>
                    </div>
                    <p className="text-xs text-slate-500">{formatDateTime(interaction.happenedAt)}</p>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{interaction.body ?? "No notes added."}</p>
                  <p className="mt-3 text-xs text-slate-500">Logged by {interaction.createdBy.name}</p>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
                No interactions logged for this lead yet.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Tasks</h2>
            <span className="text-sm text-slate-500">{lead.tasks.length} follow-ups</span>
          </div>
          <div className="space-y-4">
            {lead.tasks.length > 0 ? (
              lead.tasks.map((task) => (
                <article key={task.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{task.title}</h3>
                      <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                        {task.done ? "Completed" : "Open"} · Due {formatDateTime(task.dueDate)}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${task.done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {task.done ? "Done" : "Pending"}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{task.description ?? "No description provided."}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>Assigned to {task.assignedTo?.name ?? "Nobody"}</span>
                    <span>Created by {task.createdBy.name}</span>
                    <span>Completed at {formatDateTime(task.doneAt)}</span>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
                No follow-up tasks attached to this lead yet.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
