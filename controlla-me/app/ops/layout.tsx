export const metadata = {
  title: "Operations Center — Poimandres",
};

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--fg-primary)]">
      {children}
    </div>
  );
}
