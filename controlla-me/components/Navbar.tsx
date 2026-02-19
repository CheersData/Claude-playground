"use client";

import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-6 md:px-10 py-5 bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-white/[0.04]">
      <Link href="/" className="flex items-baseline gap-0.5">
        <span className="font-serif text-[28px] text-white italic">
          controlla
        </span>
        <span className="font-serif text-[28px] text-accent">.me</span>
      </Link>

      <div className="flex gap-3 items-center">
        <button className="hidden md:block px-5 py-2.5 rounded-full text-sm font-medium text-white/70 border border-white/[0.15] hover:border-white/40 hover:text-white transition-all">
          Come funziona
        </button>
        <button className="hidden md:block px-5 py-2.5 rounded-full text-sm font-medium text-white/70 border border-white/[0.15] hover:border-white/40 hover:text-white transition-all">
          Prezzi
        </button>
        <Link
          href="/dashboard"
          className="px-5 py-2.5 rounded-full text-sm font-bold text-white bg-gradient-to-br from-accent to-[#E8451A] hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(255,107,53,0.35)] transition-all"
        >
          Accedi
        </Link>
      </div>
    </nav>
  );
}
