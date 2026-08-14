import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LifecycleStageBadge } from "@/components/LifecycleStageBadge";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { contactCreateSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const fieldClasses =
  "rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring";

export default async function ContactsPage() {
  const [contacts, customers] = await Promise.all([
    prisma.contact.findMany({
      orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
      include: {
        customer: { select: { id: true, companyName: true, stage: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.customer.findMany({ orderBy: { companyName: "asc" }, select: { id: true, companyName: true } }),
  ]);

  async function createContactAction(formData: FormData) {
    "use server";

    const session = await getServerAuthSession();

    if (!session?.user) {
      redirect("/login");
    }

    const parsed = contactCreateSchema.safeParse({
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      title: formData.get("title"),
      customerId: formData.get("customerId"),
      isPrimary: formData.get("isPrimary"),
      notes: formData.get("notes"),
    });

    if (!parsed.success) {
      redirect("/dashboard/contacts?error=validation");
    }

    await prisma.contact.create({
      data: {
        ...parsed.data,
        createdById: session.user.id,
      },
    });

    revalidatePath("/dashboard/contacts");

    if (parsed.data.customerId) {
      revalidatePath(`/dashboard/customers/${parsed.data.customerId}`);
    }

    redirect("/dashboard/contacts");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Contacts</h1>
        <p className="mt-2 text-sm text-slate-500">
          The people at each merchant — decision makers, operations staff, and accountants we deal
          with. Every contact belongs to a customer company.
        </p>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Add contact</h2>
        <form action={createContactAction} className="mt-5 grid gap-4 md:grid-cols-2">
          <input className={fieldClasses} name="firstName" placeholder="First name" required />
          <input className={fieldClasses} name="lastName" placeholder="Last name" required />
          <input className={fieldClasses} name="email" placeholder="Email" type="email" />
          <input className={fieldClasses} name="phone" placeholder="Phone" />
          <input className={fieldClasses} name="title" placeholder="Role (e.g. Managing Director)" />
          <select className={fieldClasses} name="customerId">
            <option value="">No customer linked yet</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.companyName}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-3 text-sm text-slate-700">
            <input className="h-4 w-4 rounded border-slate-300" name="isPrimary" type="checkbox" value="on" />
            Primary contact for this customer
          </label>
          <textarea
            className={`${fieldClasses} min-h-28 md:col-span-2`}
            name="notes"
            placeholder="Preferences, language, availability"
          />
          <div className="md:col-span-2 flex justify-end">
            <button
              className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
              type="submit"
            >
              Save contact
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-4 font-semibold">Contact</th>
                <th className="px-5 py-4 font-semibold">Customer</th>
                <th className="px-5 py-4 font-semibold">Stage</th>
                <th className="px-5 py-4 font-semibold">Email</th>
                <th className="px-5 py-4 font-semibold">Phone</th>
                <th className="px-5 py-4 font-semibold">Created by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {contacts.length > 0 ? (
                contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">
                        {contact.firstName} {contact.lastName}
                        {contact.isPrimary ? (
                          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            Primary
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-slate-500">{contact.title ?? "No role"}</div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {contact.customer ? (
                        <Link
                          className="font-medium text-emerald-600 hover:text-emerald-500"
                          href={`/dashboard/customers/${contact.customer.id}`}
                        >
                          {contact.customer.companyName}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {contact.customer ? <LifecycleStageBadge stage={contact.customer.stage} /> : "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{contact.email ?? "—"}</td>
                    <td className="px-5 py-4 text-slate-600">{contact.phone ?? "—"}</td>
                    <td className="px-5 py-4 text-slate-600">{contact.createdBy.name}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-5 py-10 text-center text-slate-500" colSpan={6}>
                    No contacts created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
