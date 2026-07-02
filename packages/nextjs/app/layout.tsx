import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { BlockchainBg } from "../components/BlockchainBg";

export const metadata: Metadata = {
  title: "Covenant — Crowdfunding with enforced accountability",
  description:
    "Donations stay locked in smart-contract escrow until campaign creators post public milestone evidence on-chain. The money follows the proof.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <Providers>
          <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
            <BlockchainBg />
          </div>
          <div className="relative z-[1] flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
