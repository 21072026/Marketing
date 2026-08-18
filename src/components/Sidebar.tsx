"use client";

import { UserRole } from "@prisma/client";
import clsx from "clsx";
import { BarChart3, Building2, LogOut, Megaphone, Users, UserSquare2 } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const baseNavigation = [
  { href: "/dashboard", label: "Overview", icon: BarChart3 },
  { href: "/dashboard/customers", label: "Customers", icon: Building2 },
  { href: "/dashboard/contacts", label: "Contacts", icon: Users },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone },
];

export function Sidebar({
  name,
  role,
}: {
  name?: string | null;
  role: UserRole;
}) {
  const pathname = usePathname();
  const navigation =
    role === UserRole.ADMIN
      ? [...baseNavigation, { href: "/dashboard/users", label: "Users", icon: UserSquare2 }]
      : baseNavigation;

  return (
    <aside className="flex w-full flex-col border-b border-slate-200 bg-slate-950 text-slate-100 lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r">
      <div className="border-b border-slate-800 px-6 py-6">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">SaleVali CRM</p>
        <h2 className="mt-3 text-xl font-semibold">Customer acquisition</h2>
        <p className="mt-2 text-sm text-slate-400">
          {name ?? "Team member"} · {role.toLowerCase()}
        </p>
      </div>

      <nav className="flex-1 space-y-2 px-4 py-6">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition",
                active
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "text-slate-300 hover:bg-slate-900 hover:text-white",
              )}
              href={item.href}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-4">
        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-600 hover:bg-slate-900"
          onClick={() => signOut({ callbackUrl: "/login" })}
          type="button"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
