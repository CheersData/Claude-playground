import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Poimandres — AI per gli umani",
  description:
    "Poimandres e la piattaforma madre per team di agenti AI specializzati: analisi legale (controlla.me), studio medico (studia.me), direzione artistica musicale e strumenti per PMI.",
  manifest: "/manifest.webmanifest",
  themeColor: "#FF6B35",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Poimandres",
  },
  openGraph: {
    title: "Poimandres — AI per gli umani",
    description:
      "Piattaforma AI multi-verticale con agenti specializzati: legale, medico, musica, integrazione PMI.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <head>
        {/* Google Search Console verification — set NEXT_PUBLIC_GSC_VERIFICATION in .env.local */}
        {process.env.NEXT_PUBLIC_GSC_VERIFICATION && (
          <meta
            name="google-site-verification"
            content={process.env.NEXT_PUBLIC_GSC_VERIFICATION}
          />
        )}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router: fonts in layout.tsx è corretto */}
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        <a href="#main-content" className="skip-nav">
          Vai al contenuto principale
        </a>
        <div id="main-content">
          {children}
        </div>
        <ServiceWorkerRegistration />
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
        )}
      </body>
    </html>
  );
}
