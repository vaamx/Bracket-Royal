import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getT } from "@/lib/i18n";
import { I18nProvider } from "@/lib/i18n/provider";
import { TrackPageViews } from "@/components/analytics/TrackPageViews";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.meta.title, description: t.meta.description };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale } = await getT();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TrackPageViews />
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
