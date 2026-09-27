import type { Metadata } from "next";
import { Toaster } from "sonner";
import { LangProvider } from "@/components/common/lang-provider";
import { getLang, siteName } from "@/lib/server/i18n-server";
import { requestOrigin } from "@/lib/server/request";
import { shareCard, shareCopy } from "@/lib/share-card";
import "./globals.css";
import "./ringo-home.css";
import "./ringo-workspace.css";
import "./console.css";

export async function generateMetadata(): Promise<Metadata> {
  // The shop name from Preferences names every page; it used to be saved but never shown anywhere.
  const name = await siteName();
  return {
    // Absolute URLs for og:image / canonical: APP_URL in production, the forwarded host otherwise.
    metadataBase: new URL(await requestOrigin()),
    title: { default: `${name} — Digital goods, endless possibilities`, template: `%s · ${name}` },
    description: "Discover independent eBooks, courses, design resources and creative services on Ringo.",
    openGraph: { type: "website", siteName: "Ringo", title: shareCopy.title, description: shareCopy.description, images: [shareCard] },
    twitter: { card: "summary_large_image", title: shareCopy.title, description: shareCopy.description, images: [shareCard.url] },
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  };
}

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
