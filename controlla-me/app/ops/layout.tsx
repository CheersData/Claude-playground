export const metadata = {
  title: "Operations Center — Poimandres",
};

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {children}
    </div>
  );
}
