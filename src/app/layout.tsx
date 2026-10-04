import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Provisional faces (serif headlines, humanist sans body), identified by eye from the mockups. Confirm.
const sans = Inter({ variable: "--font-sans-face", subsets: ["latin"], display: "swap" });
const heading = Source_Serif_4({ variable: "--font-heading-face", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Star Valley Local", template: "%s | Star Valley Local" },
  description: "Your guide to local businesses, events, and deals in Star Valley, Wyoming.",
};

// Slice 2: resolve the tenant from the request host and pass buildThemeStyle(tenant.theme).style as the
// `style` prop of <html>. Until then every request gets the default (Star Valley) tokens.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${heading.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-surface-page font-sans text-text-body">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-button focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-contrast"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
