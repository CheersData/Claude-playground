import type { Metadata } from "next";
import { Playfair_Display, DM_Sans } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Gherardi Pro | Eccellenza Sartoriale su Misura",
  description:
    "Partner manifatturiero per le griffe del lusso. Oltre 500.000 camicie l'anno, tecnologia AI e finiture artigianali dal cuore della Toscana.",
  keywords: [
    "camicie lusso",
    "camiceria italiana",
    "luxury shirt manufacturer",
    "private label shirts",
    "made in Italy",
    "Gherardi Pro",
    "Pieve Santo Stefano",
  ],
  openGraph: {
    title: "Gherardi Pro | Eccellenza Sartoriale su Misura",
    description:
      "Partner manifatturiero per le griffe del lusso. Oltre 500.000 camicie l'anno dal cuore della Toscana.",
    type: "website",
    locale: "it_IT",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${playfair.variable} ${dmSans.variable}`}>
      <body className="font-[family-name:var(--font-dm-sans)] antialiased">
        <div className="noise-overlay" />
        {children}
      </body>
    </html>
  );
}
