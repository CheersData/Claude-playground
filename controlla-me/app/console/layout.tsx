import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LexMea — Console Legale AI",
  description:
    "Analisi legale AI con agenti specializzati. Carica documenti o fai domande sulla legislazione italiana.",
};

export default function ConsoleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap"
        rel="stylesheet"
      />
      <div className="pipboy-root min-h-screen bg-[var(--pb-bg)]">
        {children}
      </div>
    </>
  );
}
