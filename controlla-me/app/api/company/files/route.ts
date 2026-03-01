/**
 * GET /api/company/files?path=company/ufficio-legale/agents/classifier.md
 *
 * Serve i file .md sotto la directory company/ del progetto.
 * Whitelist di sicurezza: solo file dentro company/ sono accessibili.
 * Usato da DepartmentDetailPanel per mostrare il contenuto di agenti e runbook.
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const filePath = url.searchParams.get("path");

  if (!filePath) {
    return NextResponse.json({ error: "Parametro 'path' obbligatorio" }, { status: 400 });
  }

  // Security: whitelist — solo file dentro company/
  const companyRoot = path.resolve(process.cwd(), "company");
  const absPath = path.resolve(process.cwd(), filePath);

  if (!absPath.startsWith(companyRoot)) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  if (!absPath.endsWith(".md")) {
    return NextResponse.json({ error: "Solo file .md sono accessibili" }, { status: 403 });
  }

  try {
    if (!fs.existsSync(absPath)) {
      return NextResponse.json({ error: "File non trovato" }, { status: 404 });
    }
    const content = fs.readFileSync(absPath, "utf-8");
    return NextResponse.json({ content, path: filePath });
  } catch {
    return NextResponse.json({ error: "Errore lettura file" }, { status: 500 });
  }
}
