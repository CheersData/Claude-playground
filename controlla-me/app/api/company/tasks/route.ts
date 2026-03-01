/**
 * API Company Tasks — GET (list) + POST (create)
 */

import { NextRequest, NextResponse } from "next/server";
import { createTask, getOpenTasks } from "@/lib/company/tasks";
import type { Department, TaskStatus } from "@/lib/company/types";
import { requireConsoleAuth } from "@/lib/middleware/console-token";

export async function GET(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const department = url.searchParams.get("dept") as Department | null;
    const status = url.searchParams.get("status") as TaskStatus | null;
    const createdBy = url.searchParams.get("by");
    const limit = url.searchParams.get("limit");

    const tasks = await getOpenTasks({
      department: department ?? undefined,
      status: status ?? undefined,
      createdBy: createdBy ?? undefined,
      limit: limit ? parseInt(limit) : undefined,
    });

    return NextResponse.json({ tasks, count: tasks.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    if (!body.title || !body.department || !body.createdBy) {
      return NextResponse.json(
        { error: "title, department, and createdBy are required" },
        { status: 400 }
      );
    }

    const task = await createTask({
      title: body.title,
      description: body.description,
      department: body.department,
      priority: body.priority,
      createdBy: body.createdBy,
      parentTaskId: body.parentTaskId,
      blockedBy: body.blockedBy,
      labels: body.labels,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
