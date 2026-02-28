"use client";

export default function StudioShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="studio-root relative min-h-screen bg-white">
      {children}
    </div>
  );
}
