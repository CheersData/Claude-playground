/**
 * API Company Tasks [id] — GET + PATCH
 */

import { NextRequest, NextResponse } from "next/server";
import { getTask, updateTask, claimTask } from "@/lib/company/tasks";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = await getTask(id);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json({ task });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Special case: claim
    if (body.claim && body.agent) {
      const task = await claimTask(id, body.agent);
      return NextResponse.json({ task });
    }

    const task = await updateTask(id, {
      status: body.status,
      assignedTo: body.assignedTo,
      resultSummary: body.resultSummary,
      resultData: body.resultData,
      labels: body.labels,
    });

    return NextResponse.json({ task });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
