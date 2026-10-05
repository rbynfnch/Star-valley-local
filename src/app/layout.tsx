import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Bricolage Grotesque (headlines, feature titles, section headings, Hotlist, prominent numbers) and Inter (everything else).
// Variable fonts, Latin subset, self-hosted from src/app/fonts (SIL Open Font License, texts alongside): no request to a third party.
const sans = localFont({ src: "./fonts/Inter-latin-variable.woff2", variable: "--font-sans-face", weight: "100 900", display: "swap" });
const heading = localFont({ src: "./fonts/BricolageGrotesque-latin-variable.woff2", variable: "--font-heading-face", weight: "200 800", display: "swap" });

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
