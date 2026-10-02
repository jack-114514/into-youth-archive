export type ChatMessage = { role: "user" | "assistant"; content: string };

// Keep the full reply in the conversation; only the API context is shortened.
export function chatContext(messages: ChatMessage[]): ChatMessage[] {
  const kept: ChatMessage[] = [];
  let length = 0;
  for (const message of messages.slice(-12).reverse()) {
    const content = message.content.slice(0, message.role === "user" ? 2000 : 6000);
    if (length + content.length > 18000) break;
    kept.unshift({ role: message.role, content });
    length += content.length;
  }
  while (kept[0]?.role === "assistant") kept.shift();
  return kept;
}

export function replyStep(length: number) {
  return length > 500 ? Math.ceil(length / 120) : 1;
}
