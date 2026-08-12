import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Sidebar } from "@/components/Sidebar";
import { getServerAuthSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar name={session.user.name} role={session.user.role} />
      <main className="flex-1 bg-slate-100 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
