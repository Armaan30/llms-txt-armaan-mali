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
      <body className="flex min-h-full flex-col bg-white text-zinc-900 dark:bg-[#0a0a0a] dark:text-zinc-100">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-5 py-4">
            <Link href="/" className="font-mono text-sm font-semibold tracking-tight">
              llms.txt<span className="text-zinc-400 dark:text-zinc-600">/generator</span>
            </Link>
            <a
              href="https://llmstxt.org"
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-zinc-500 underline decoration-dotted underline-offset-4 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              spec
            </a>
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">{children}</main>
        <footer className="border-t border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto w-full max-w-4xl px-5 py-5 font-mono text-[11px] text-zinc-400 dark:text-zinc-600">
            built by armaan mali · crawls politely · respects robots.txt
          </div>
        </footer>
      </body>
    </html>
  );
}
