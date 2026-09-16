import type { Metadata } from "next";
import { Toaster } from "sonner";
import { LangProvider } from "@/components/common/lang-provider";
import { getLang } from "@/lib/server/i18n-server";
import "./globals.css";
import "./ringo-home.css";
import "./ringo-workspace.css";
import "./console.css";

export const metadata: Metadata = {
  title: { default: "Ringo — Digital goods, endless possibilities", template: "%s · Ringo" },
  description: "Discover independent eBooks, courses, design resources and creative services on Ringo.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const lang = await getLang();
  return (
    <html lang={lang}>
      <body className="antialiased">
        <LangProvider lang={lang}>
          {children}
          <Toaster richColors position="top-center" />
        </LangProvider>
      </body>
    </html>
  );
}
