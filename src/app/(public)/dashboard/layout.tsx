import type { Metadata } from "next";

export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · Dashboard" }, robots: { index: false, follow: false } };
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return <main id="main" className="mx-auto w-full max-w-[var(--container-max)] flex-1 px-4 py-8 sm:px-8">{children}</main>;
}
