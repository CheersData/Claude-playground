import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "controlla.me — Console Legale AI",
  description:
    "Analisi legale AI con agenti specializzati. Carica documenti o fai domande sulla legislazione italiana.",
};

export default function ConsoleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-white">
      {children}
    </div>
  );
}
