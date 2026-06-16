import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getT } from "@/lib/i18n";
import { I18nProvider } from "@/lib/i18n/provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bracket Royale · World Cup 2026 Predictions",
  description:
    "Predict every match, build your knockout bracket, and climb the live leaderboard with friends.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale, t } = await getT();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={locale} dict={t}>{children}</I18nProvider>
      </body>
    </html>
  );
}
