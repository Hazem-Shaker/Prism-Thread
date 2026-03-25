import { env } from "../../../config/env";
import { AIProvider, ChatMessage } from "../ai.types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

interface OpenRouterResponse {
  choices?: Array<{ message: { role: string; content: string } }>;
  error?: { message: string };
}

export class OpenRouterProvider implements AIProvider {
  constructor(private modelId: string) {}

  async generateReply(messages: ChatMessage[]): Promise<string> {
    const mapped = messages.map((m) => ({
      role: m.role === "model" ? "assistant" : "user",
      content: m.content,
    }));

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.openRouterApiKey}`,
      },
      body: JSON.stringify({ model: this.modelId, messages: mapped }),
    });

    if (!res.ok) {
      throw new Error(
        `OpenRouter error (${res.status}): ${await res.text()}`
      );
    }

    const data = (await res.json()) as OpenRouterResponse;

    if (data.error) throw new Error(`OpenRouter: ${data.error.message}`);

    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("No response from OpenRouter");
    return text;
  }
}
