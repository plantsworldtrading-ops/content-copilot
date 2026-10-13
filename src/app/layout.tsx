import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { AppProviders } from "@/components/AppProviders";
import WorkspaceBadge from "@/components/WorkspaceBadge";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Content Copilot",
  description: "Script, footage, voiceover and subtitles, packaged for your video editor.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <AppProviders>
          <header className="border-b border-line bg-surface">
            <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:gap-6 sm:px-6">
              <Link href="/" className="font-semibold tracking-tight">
                Content Copilot
              </Link>
              <div className="flex gap-1 text-sm">
                <Link href="/" className="rounded-md px-2.5 py-1.5 text-fg-soft hover:bg-muted hover:text-fg">
                  Projects
                </Link>
                <Link href="/settings" className="rounded-md px-2.5 py-1.5 text-fg-soft hover:bg-muted hover:text-fg">
                  Settings
                </Link>
              </div>
              <div className="ml-auto min-w-0">
                <WorkspaceBadge />
              </div>
            </nav>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
        </AppProviders>
      </body>
    </html>
  );
}
