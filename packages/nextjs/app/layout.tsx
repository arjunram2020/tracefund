import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";

export const metadata: Metadata = {
  title: "Covenant — Crowdfunding with enforced accountability",
  description:
    "Donations stay locked in smart-contract escrow until campaign creators submit milestone evidence and donors approve each release.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <Providers>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
