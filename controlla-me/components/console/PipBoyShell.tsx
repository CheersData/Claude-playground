"use client";

export default function PipBoyShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen">
      {/* Scanlines overlay */}
      <div className="pipboy-scanlines" />
      {/* CRT vignette */}
      <div className="pipboy-crt" />
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
