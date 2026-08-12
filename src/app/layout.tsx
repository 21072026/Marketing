import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getServerAuthSession } from "@/lib/auth";
import { Providers } from "@/app/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "Marketing CRM",
  description: "A modern marketing CRM for leads, campaigns, contacts, and sales workflows.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await getServerAuthSession();

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}
