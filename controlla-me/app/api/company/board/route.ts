/**
 * API Company Board — GET aggregato per dashboard
 */

import { NextRequest, NextResponse } from "next/server";
import { getTaskBoard } from "@/lib/company/tasks";
import { requireConsoleAuth } from "@/lib/middleware/console-token";

export async function GET(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const board = await getTaskBoard();
    return NextResponse.json(board);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
