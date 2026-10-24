import type { Metadata, Viewport } from "next";
import { PreferencesProvider } from "@/components/preferences";
import { preferenceScript } from "@/lib/preference-script";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Background } from "@/components/background";
import { FragmentNavigation } from "@/components/fragment-navigation";
import { site } from "@/lib/site";
import "@fontsource-variable/outfit/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "MunaSIP — Your calls. Your flow. Your control.",
    template: "%s — MunaSIP",
  },
  description: site.description,
  applicationName: site.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: site.name,
    title: "MunaSIP — Your calls. Your flow. Your control.",
    description: site.description,
    url: "/",
    images: [
      {
        url: "/brand/og-image.png",
        width: 1200,
        height: 630,
        alt: "MunaSIP — self-hosted company PBX",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MunaSIP — Your calls. Your flow. Your control.",
    description: site.description,
    images: ["/brand/og-image.png"],
  },
  icons: {
    icon: "/brand/munasip-mark.svg",
    apple: "/brand/apple-touch-icon.png",
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
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          <Background />
          <Header />
          <main id="main">{children}</main>
          <Footer />
        </PreferencesProvider>
      </body>
    </html>
  );
}
