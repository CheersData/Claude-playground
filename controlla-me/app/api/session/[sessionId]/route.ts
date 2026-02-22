import { NextRequest, NextResponse } from "next/server";
import { loadSession } from "@/lib/analysis-cache";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const session = await loadSession(sessionId);

  if (!session) {
    return NextResponse.json(
      { error: "Sessione non trovata" },
      { status: 404 }
    );
  }

  return NextResponse.json(session);
}
