/**
 * API Company Board — GET aggregato per dashboard
 */

import { NextResponse } from "next/server";
import { getTaskBoard } from "@/lib/company/tasks";

export async function GET() {
  try {
    const board = await getTaskBoard();
    return NextResponse.json(board);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
