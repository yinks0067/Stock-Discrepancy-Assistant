import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { aiEnabled } from "@/src/service";

export const metadata: Metadata = {
  title: "Stock Discrepancy Assistant",
  description: "Finds stock that doesn't match the shelf and explains why, using an AI agent with tool use.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const ai = aiEnabled();
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="top">
            <Link href="/" className="logo">
              <span className="logo-mark">▦</span> Stock Discrepancy Assistant
            </Link>
            <span className={ai ? "pill" : "pill warn"} title={ai ? "Investigations use Claude with tool use" : "Set ANTHROPIC_API_KEY to use the AI agent"}>
              {ai ? "AI agent: Claude" : "Offline mode: rule-based"}
            </span>
          </header>
          {children}
          <footer>Demo store data: 128 products over 90 days (synthetic). Money in GBP at cost price.</footer>
        </div>
      </body>
    </html>
  );
}
