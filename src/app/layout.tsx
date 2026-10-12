import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "FOOTMB · Inventory Hub",
  description: "Tableau de bord privé des stocks FOOTMB",
  robots: { index: false, follow: false, nocache: true },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1,
  viewportFit: "cover", themeColor: "#10151b",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
