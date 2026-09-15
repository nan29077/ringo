import type { Metadata } from "next";
import "./globals.css";
import "./ringo-home.css";

export const metadata: Metadata = {
  title: "Ringo — Digital goods, endless possibilities",
  description: "Discover independent eBooks, design resources and creative tools on Ringo.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
