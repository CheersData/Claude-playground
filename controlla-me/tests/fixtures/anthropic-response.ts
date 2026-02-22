import type Anthropic from "@anthropic-ai/sdk";

export function makeAnthropicResponse(
  text: string,
  overrides?: {
    stop_reason?: string;
    extra_content?: Anthropic.Messages.ContentBlock[];
  }
): Anthropic.Messages.Message {
  const content: Anthropic.Messages.ContentBlock[] = [
    { type: "text", text } as Anthropic.Messages.TextBlock,
  ];

  if (overrides?.extra_content) {
    content.push(...overrides.extra_content);
  }

  return {
    id: "msg_test_123",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-5-20250929",
    content,
    stop_reason: overrides?.stop_reason ?? "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } as Anthropic.Messages.Message;
}

export function makeToolUseBlock(
  id: string,
  name: string,
  input: unknown
): Anthropic.Messages.ToolUseBlock {
  return {
    type: "tool_use",
    id,
    name,
    input,
  } as Anthropic.Messages.ToolUseBlock;
}
