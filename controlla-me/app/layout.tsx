import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "controlla.me — Analisi AI di documenti legali",
  description:
    "Carica un contratto, una bolletta, un documento legale. L'AI lo analizza, trova norme e sentenze, e ti dice cosa fare.",
  openGraph: {
    title: "controlla.me — Non firmare nulla che non capisci",
    description:
      "4 agenti AI analizzano il tuo documento in 30 secondi. Rischi, norme, sentenze e azioni consigliate.",
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased bg-[#FAFAFA] text-[#1A1A2E]">
        {children}
      </body>
    </html>
  );
}
