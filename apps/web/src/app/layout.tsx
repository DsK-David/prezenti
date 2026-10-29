import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Figtree, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa";

const display = Plus_Jakarta_Sans({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700", "800"] });
const body = Figtree({ variable: "--font-body", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Prezenti", statusBarStyle: "default" },
  applicationName: "Prezenti",
  title: "Prezenti",
  description: "Saiba que chegaram bem. Presenças escolares com aviso à família.",
};

export const viewport: Viewport = {
  themeColor: "#f6f8fc",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt" className={`${display.variable} ${body.variable} ${mono.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}<PwaRegister /></body>
    </html>
  );
}
