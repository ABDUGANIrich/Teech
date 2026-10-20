import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { siteDescription, siteTitle, siteUrl } from "@/lib/site";
import "./globals.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: "%s · Teech",
  },
  description: siteDescription,
  applicationName: "Teech",
  openGraph: {
    type: "website",
    siteName: "Teech",
    locale: "en_US",
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
