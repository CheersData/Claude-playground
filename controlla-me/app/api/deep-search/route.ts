import { NextRequest, NextResponse } from "next/server";
import { runDeepSearch } from "@/lib/agents/investigator";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clauseContext, existingAnalysis, userQuestion, analysisId } = body;

    if (!userQuestion || !userQuestion.trim()) {
      return NextResponse.json(
        { error: "Domanda non fornita" },
        { status: 400 }
      );
    }

    const result = await runDeepSearch(
      clauseContext || "",
      existingAnalysis || "",
      userQuestion
    );

    return NextResponse.json({
      analysisId,
      question: userQuestion,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Errore durante la ricerca";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
