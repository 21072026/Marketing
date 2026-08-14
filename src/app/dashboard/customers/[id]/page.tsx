import { InteractionType, LifecycleStage } from "@prisma/client";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LifecycleStageBadge } from "@/components/LifecycleStageBadge";
import {
  CANCELLATION_NOTICE_DAYS,
  CUSTOMER_LOCALE_LABELS,
  CUSTOMER_SOURCE_LABELS,
  INTEGRATION_CHANNEL_LABELS,
  INTEGRATION_CHANNEL_OPTIONS,
  INTEGRATION_STATUS_LABELS,
  INTEGRATION_STATUS_OPTIONS,
  INTERACTION_TYPE_LABELS,
  INTERACTION_TYPE_OPTIONS,
  LIFECYCLE_STAGE_LABELS,
  LIFECYCLE_STAGE_ORDER,
  PRICING_MODEL_LABELS,
  SEPA_MANDATE_STATUS_LABELS,
} from "@/lib/constants";
import { getServerAuthSession } from "@/lib/auth";
import {
  contractEndDate,
  daysUntil,
  decimalToNumber,
  estimateMonthlyRevenue,
  formatCurrency,
  lifecycleTimestampsFor,
} from "@/lib/lifecycle";
import { prisma } from "@/lib/prisma";
import {
  customerStageChangeSchema,
  integrationUpsertSchema,
  interactionCreateSchema,
  taskCreateSchema,
} from "@/lib/schemas";

export const dynamic = "force-dynamic";

const fieldClasses =
  "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring";

function formatDate(value: Date | null | undefined) {
  return value ? value.toLocaleDateString() : "—";
}

function formatDateTime(value: Date | null | undefined) {
  return value ? value.toLocaleString() : "—";
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [customer, users] = await Promise.all([
    prisma.customer.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { name: true, email: true } },
        campaign: true,
        createdBy: { select: { name: true } },
        contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] },
        integrations: { orderBy: { channel: "asc" } },
        interactions: {
          include: { createdBy: { select: { name: true } } },
          orderBy: { happenedAt: "desc" },
        },
        tasks: {
          include: {
            assignedTo: { select: { name: true } },
            createdBy: { select: { name: true } },
          },
          orderBy: [{ done: "asc" }, { dueDate: "asc" }],
        },
        stageHistory: {
          include: { createdBy: { select: { name: true } } },
          orderBy: { changedAt: "desc" },
        },
      },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!customer) {
    notFound();
  }

  async function changeStageAction(formData: FormData) {
    "use server";

    const session = await getServerAuthSession();

    if (!session?.user) {
      redirect("/login");
    }

    const parsed = customerStageChangeSchema.safeParse({
      stage: formData.get("stage"),
      note: formData.get("note"),
    });

    if (!parsed.success) {
      redirect(`/dashboard/customers/${id}?error=stage`);
    }

    const existing = await prisma.customer.findUnique({ where: { id } });

    if (!existing) {
      notFound();
    }

    await prisma.customer.update({
      where: { id },
      data: {
        stage: parsed.data.stage,
        ...lifecycleTimestampsFor(parsed.data.stage, existing),
        stageHistory: {
          create: {
            fromStage: existing.stage,
            toStage: parsed.data.stage,
            note: parsed.data.note,
            createdById: session.user.id,
          },
        },
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/customers");
    revalidatePath(`/dashboard/customers/${id}`);
  }

  async function logInteractionAction(formData: FormData) {
    "use server";

    const session = await getServerAuthSession();

    if (!session?.user) {
      redirect("/login");
    }

    const parsed = interactionCreateSchema.safeParse({
      type: formData.get("type") ?? InteractionType.NOTE,
      subject: formData.get("subject"),
      body: formData.get("body"),
      happenedAt: formData.get("happenedAt"),
    });

    if (!parsed.success) {
      redirect(`/dashboard/customers/${id}?error=interaction`);
    }

    await prisma.interaction.create({
      data: {
        ...parsed.data,
        customerId: id,
        createdById: session.user.id,
      },
    });

    revalidatePath(`/dashboard/customers/${id}`);
  }

  async function createTaskAction(formData: FormData) {
    "use server";

    const session = await getServerAuthSession();

    if (!session?.user) {
      redirect("/login");
    }

    const parsed = taskCreateSchema.safeParse({
      title: formData.get("title"),
      description: formData.get("description"),
      dueDate: formData.get("dueDate"),
      assignedToId: formData.get("assignedToId"),
    });

    if (!parsed.success) {
      redirect(`/dashboard/customers/${id}?error=task`);
    }

    await prisma.task.create({
      data: {
        ...parsed.data,
        customerId: id,
        createdById: session.user.id,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/customers/${id}`);
  }

  async function toggleTaskAction(formData: FormData) {
    "use server";

    const session = await getServerAuthSession();

    if (!session?.user) {
      redirect("/login");
    }

    const taskId = formData.get("taskId");

    if (typeof taskId !== "string" || taskId.trim() === "") {
      redirect(`/dashboard/customers/${id}?error=task`);
    }

    // Scope the lookup to this customer so a stray id cannot flip someone else's task.
    const task = await prisma.task.findFirst({
      where: { id: taskId, customerId: id },
      select: { id: true, done: true },
    });

    if (!task) {
      redirect(`/dashboard/customers/${id}?error=task`);
    }

    await prisma.task.update({
      where: { id: task.id },
      data: { done: !task.done, doneAt: task.done ? null : new Date() },
    });

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/customers/${id}`);
  }

  async function upsertIntegrationAction(formData: FormData) {
    "use server";

    const session = await getServerAuthSession();

    if (!session?.user) {
      redirect("/login");
    }

    const parsed = integrationUpsertSchema.safeParse({
      channel: formData.get("channel"),
      status: formData.get("status"),
      notes: formData.get("notes"),
    });

    if (!parsed.success) {
      redirect(`/dashboard/customers/${id}?error=integration`);
    }

    const { channel, status, notes } = parsed.data;

    await prisma.customerIntegration.upsert({
      where: { customerId_channel: { customerId: id, channel } },
      update: { status, notes },
      create: { customerId: id, channel, status, notes },
    });

    revalidatePath(`/dashboard/customers/${id}`);
  }

  const mrr = decimalToNumber(customer.mrr);
  const estimatedRevenue = estimateMonthlyRevenue(customer.pricingModel, customer.monthlyTransactions);
  const trialDaysLeft =
    customer.stage === LifecycleStage.TRIAL_ACTIVE_500 ? daysUntil(customer.trialEndsAt) : null;
  const contractEnd = contractEndDate(customer.cancellationNoticeAt);

  const facts = [
    { label: "Source", value: CUSTOMER_SOURCE_LABELS[customer.source] },
    { label: "Billing model", value: PRICING_MODEL_LABELS[customer.pricingModel] },
    {
      label: "Monthly transactions",
      value: customer.monthlyTransactions?.toLocaleString() ?? "Unknown",
    },
    {
      label: "Recurring revenue",
      value:
        mrr !== null
          ? formatCurrency(mrr, customer.currency)
          : `${formatCurrency(estimatedRevenue, customer.currency)} (estimated)`,
    },
    { label: "SEPA mandate", value: SEPA_MANDATE_STATUS_LABELS[customer.sepaMandateStatus] },
    { label: "Interface language", value: CUSTOMER_LOCALE_LABELS[customer.locale] },
    { label: "Owner", value: customer.assignedTo?.name ?? "Unassigned" },
    { label: "Source campaign", value: customer.campaign?.name ?? "None" },
  ];

  const timeline = [
    { label: "Trial started", value: formatDate(customer.trialStartedAt) },
    { label: "Trial ends", value: formatDate(customer.trialEndsAt) },
    { label: "Converted", value: formatDate(customer.convertedAt) },
    { label: "Cancellation notice", value: formatDate(customer.cancellationNoticeAt) },
    { label: `Contract ends (+${CANCELLATION_NOTICE_DAYS}d)`, value: formatDate(contractEnd) },
    { label: "Churned", value: formatDate(customer.churnedAt) },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-900">{customer.companyName}</h1>
              <LifecycleStageBadge stage={customer.stage} />
            </div>
            <p className="text-sm text-slate-500">
              {[customer.legalName, customer.city, customer.country, customer.industry]
                .filter(Boolean)
                .join(" · ") || "No company details recorded"}
            </p>
            <p className="text-sm text-slate-500">
              {customer.website ? (
                <a className="font-medium text-emerald-600 hover:text-emerald-500" href={customer.website} rel="noreferrer noopener" target="_blank">
                  {customer.website}
                </a>
              ) : (
                "No website"
              )}
              {customer.vatId ? ` · VAT ${customer.vatId}` : ""}
            </p>
            <p className="text-xs text-slate-500">
              Added by {customer.createdBy.name} on {formatDate(customer.createdAt)}
            </p>
            {trialDaysLeft !== null ? (
              <p
                className={`text-sm font-semibold ${
                  trialDaysLeft <= 7 ? "text-rose-600" : "text-amber-600"
                }`}
              >
                {trialDaysLeft >= 0
                  ? `Trial ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"}`
                  : `Trial ended ${Math.abs(trialDaysLeft)} days ago — no auto-renewal`}
              </p>
            ) : null}
          </div>

          <form action={changeStageAction} className="w-full max-w-sm space-y-3 rounded-2xl bg-slate-950 p-5">
            <p className="text-sm font-semibold text-white">Move stage</p>
            <select className={`${fieldClasses} border-slate-700 bg-slate-900 text-slate-100`} defaultValue={customer.stage} name="stage">
              {LIFECYCLE_STAGE_ORDER.map((stage) => (
                <option key={stage} value={stage}>
                  {LIFECYCLE_STAGE_LABELS[stage]}
                </option>
              ))}
            </select>
            <textarea
              className={`${fieldClasses} min-h-20 border-slate-700 bg-slate-900 text-slate-100`}
              name="note"
              placeholder="Why is it moving? (optional)"
            />
            <button
              className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
              type="submit"
            >
              Save stage
            </button>
          </form>
        </div>

        <div className="mt-6 grid gap-4 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{fact.label}</p>
              <p className="mt-1 font-medium text-slate-900">{fact.value}</p>
            </div>
          ))}
        </div>

        {customer.notes ? (
          <div className="mt-6 rounded-2xl border border-slate-200 p-5">
            <p className="text-sm font-semibold text-slate-900">Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{customer.notes}</p>
          </div>
        ) : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Subscription timeline</h2>
          <dl className="mt-4 space-y-3 text-sm">
            {timeline.map((entry) => (
              <div key={entry.label} className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">{entry.label}</dt>
                <dd className="font-medium text-slate-900">{entry.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Contacts</h2>
          <p className="mt-1 text-sm text-slate-500">People we talk to at this merchant.</p>
          <div className="mt-4 space-y-3">
            {customer.contacts.length > 0 ? (
              customer.contacts.map((contact) => (
                <div key={contact.id} className="rounded-2xl border border-slate-200 p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">
                      {contact.firstName} {contact.lastName}
                    </p>
                    {contact.isPrimary ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                        Primary
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-500">{contact.title ?? "No title"}</p>
                  <p className="mt-2 text-xs text-slate-600">{contact.email ?? "No email"}</p>
                  <p className="text-xs text-slate-600">{contact.phone ?? "No phone"}</p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                No contacts linked yet.
              </div>
            )}
          </div>
          <Link className="mt-4 inline-block text-sm font-semibold text-emerald-600 hover:text-emerald-500" href="/dashboard/contacts">
            Manage contacts
          </Link>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Channels</h2>
          <p className="mt-1 text-sm text-slate-500">Marketplaces, shops, and carriers in play.</p>
          <div className="mt-4 space-y-2">
            {customer.integrations.length > 0 ? (
              customer.integrations.map((integration) => (
                <div
                  key={integration.id}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm"
                  data-testid="customer-channel"
                >
                  <span className="font-medium text-slate-800">
                    {INTEGRATION_CHANNEL_LABELS[integration.channel]}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {INTEGRATION_STATUS_LABELS[integration.status]}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                No channels recorded yet.
              </div>
            )}
          </div>

          <form action={upsertIntegrationAction} className="mt-5 space-y-3">
            <select className={fieldClasses} name="channel" required>
              {INTEGRATION_CHANNEL_OPTIONS.map((channel) => (
                <option key={channel} value={channel}>
                  {INTEGRATION_CHANNEL_LABELS[channel]}
                </option>
              ))}
            </select>
            <select className={fieldClasses} name="status">
              {INTEGRATION_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {INTEGRATION_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <input className={fieldClasses} name="notes" placeholder="Optional note" />
            <button
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              type="submit"
            >
              Save channel
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Interactions</h2>
            <span className="text-sm text-slate-500">{customer.interactions.length} logged</span>
          </div>

          <form action={logInteractionAction} className="mb-5 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
            <select className={fieldClasses} defaultValue={InteractionType.CALL} name="type">
              {INTERACTION_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {INTERACTION_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <input className={fieldClasses} name="happenedAt" type="date" />
            <input className={`${fieldClasses} sm:col-span-2`} name="subject" placeholder="Subject" />
            <textarea
              className={`${fieldClasses} min-h-24 sm:col-span-2`}
              name="body"
              placeholder="What was discussed?"
            />
            <div className="sm:col-span-2 flex justify-end">
              <button
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
                type="submit"
              >
                Log interaction
              </button>
            </div>
          </form>

          <div className="space-y-4">
            {customer.interactions.length > 0 ? (
              customer.interactions.map((interaction) => (
                <article key={interaction.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
                        {INTERACTION_TYPE_LABELS[interaction.type]}
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-slate-900">
                        {interaction.subject ?? "Untitled interaction"}
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500">{formatDateTime(interaction.happenedAt)}</p>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
                    {interaction.body ?? "No notes added."}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">Logged by {interaction.createdBy.name}</p>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
                No interactions logged for this customer yet.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Tasks</h2>
            <span className="text-sm text-slate-500">{customer.tasks.length} follow-ups</span>
          </div>

          <form action={createTaskAction} className="mb-5 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
            <input className={`${fieldClasses} sm:col-span-2`} name="title" placeholder="Follow up on trial setup" required />
            <input className={fieldClasses} name="dueDate" type="date" />
            <select className={fieldClasses} name="assignedToId">
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
            <textarea className={`${fieldClasses} min-h-20 sm:col-span-2`} name="description" placeholder="Details" />
            <div className="sm:col-span-2 flex justify-end">
              <button
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
                type="submit"
              >
                Add task
              </button>
            </div>
          </form>

          <div className="space-y-4">
            {customer.tasks.length > 0 ? (
              customer.tasks.map((task) => (
                <article key={task.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{task.title}</h3>
                      <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                        {task.done ? "Completed" : "Open"} · Due {formatDate(task.dueDate)}
                      </p>
                    </div>
                    <form action={toggleTaskAction}>
                      <input name="taskId" type="hidden" value={task.id} />
                      <button
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                          task.done
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                        }`}
                        type="submit"
                      >
                        {task.done ? "Reopen" : "Mark done"}
                      </button>
                    </form>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
                    {task.description ?? "No description provided."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>Assigned to {task.assignedTo?.name ?? "nobody"}</span>
                    <span>Created by {task.createdBy.name}</span>
                    <span>Completed {formatDateTime(task.doneAt)}</span>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
                No follow-up tasks for this customer yet.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Stage history</h2>
        <div className="mt-4 space-y-3">
          {customer.stageHistory.length > 0 ? (
            customer.stageHistory.map((entry) => (
              <div key={entry.id} className="flex flex-col gap-1 rounded-2xl bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-700">
                  {entry.fromStage ? `${LIFECYCLE_STAGE_LABELS[entry.fromStage]} → ` : "Created as "}
                  <span className="font-semibold text-slate-900">
                    {LIFECYCLE_STAGE_LABELS[entry.toStage]}
                  </span>
                  {entry.note ? <span className="text-slate-500"> — {entry.note}</span> : null}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(entry.changedAt)} · {entry.createdBy.name}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
              No stage changes recorded yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
