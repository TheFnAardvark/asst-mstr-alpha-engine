import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ASST & MSTR Institutional Alpha Engine (v3.1)",
  description:
    "Open-source 3-Regime Smooth-Pasting Leland (1994) ODE & SEC Form 424B5 Waterfall valuation engine for corporate Bitcoin treasuries.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
