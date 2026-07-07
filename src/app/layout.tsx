import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/shell/app-shell";
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
  title: "Indian Market — Paper Trading Terminal",
  description:
    "Live Indian market dashboard, option chain, charting and paper trading. No real orders are ever placed.",
};

// Applies the persisted theme before first paint to avoid a flash. Kept
// inline (not imported from the client ThemeProvider module) because server
// components can only import component references from client modules.
const THEME_INIT = `(function(){try{var t=localStorage.getItem("im.theme");document.documentElement.dataset.theme=(t==="light"?"light":"dark");}catch(e){document.documentElement.dataset.theme="dark";}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
