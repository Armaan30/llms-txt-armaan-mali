import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "llms.txt Generator",
  description:
    "Generate a spec-compliant llms.txt for any website — crawled, organized with Claude, and kept up to date automatically.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-4">
            <Link href="/" className="font-mono text-sm font-semibold tracking-tight">
              <span className="text-indigo-600 dark:text-indigo-400">llms.txt</span>{" "}
              generator
            </Link>
            <a
              href="https://llmstxt.org"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              spec ↗
            </a>
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
        <footer className="mx-auto w-full max-w-4xl px-4 pb-8 pt-4 text-xs text-zinc-400 dark:text-zinc-600">
          Built by Armaan Mali · crawls politely, respects robots.txt
        </footer>
      </body>
    </html>
  );
}
