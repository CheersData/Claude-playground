"use client";

export default function StudioShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="studio-root relative min-h-screen bg-white flex flex-col" role="main">
      {children}
    </main>
  );
}
