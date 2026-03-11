export const metadata = {
  title: "Operations Center — Poimandres",
};

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--ops-bg)] text-[var(--ops-fg)]">
      {children}
    </div>
  );
}
