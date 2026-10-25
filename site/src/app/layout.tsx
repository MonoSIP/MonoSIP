import type { Metadata, Viewport } from "next";
import { PreferencesProvider } from "@/components/preferences";
import { preferenceScript } from "@/lib/preference-script";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { SkipLink } from "@/components/skip-link";
import { Background } from "@/components/background";
import { FragmentNavigation } from "@/components/fragment-navigation";
import { brandFile, site } from "@/lib/site";
import "@fontsource-variable/outfit/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "MonoSIP — Your calls. Your flow. Your control.",
    template: "%s — MonoSIP",
  },
  description: site.description,
  applicationName: site.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: site.name,
    title: "MonoSIP — Your calls. Your flow. Your control.",
    description: site.description,
    url: "/",
    images: [
      {
        url: brandFile("og-image.png"),
        width: 1200,
        height: 630,
        alt: "MonoSIP — self-hosted company PBX",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MonoSIP — Your calls. Your flow. Your control.",
    description: site.description,
    images: [brandFile("og-image.png")],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: brandFile("monosip-mark.svg"), type: "image/svg+xml" },
    ],
    apple: brandFile("apple-touch-icon.png"),
  },
  robots: { index: true, follow: true },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e151b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: preferenceScript }} />
      </head>
      <body>
        <PreferencesProvider>
          <FragmentNavigation />
          <SkipLink />
          <Background />
          <Header />
          <main id="main">{children}</main>
          <Footer />
        </PreferencesProvider>
      </body>
    </html>
  );
}
