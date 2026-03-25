import { env } from "../../../config/env";
import { AIProvider, ChatMessage } from "../ai.types";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

interface GroqResponse {
  choices?: Array<{ message: { role: string; content: string } }>;
  error?: { message: string };
}

export class GroqProvider implements AIProvider {
  constructor(private modelId: string) {}

  async generateReply(messages: ChatMessage[]): Promise<string> {
    const mapped = messages.map((m) => ({
      role: m.role === "model" ? "assistant" : "user",
      content: m.content,
    }));

    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.groqApiKey}`,
      },
      body: JSON.stringify({ model: this.modelId, messages: mapped }),
    });

    if (!res.ok) {
      throw new Error(`Groq error (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as GroqResponse;

    if (data.error) throw new Error(`Groq: ${data.error.message}`);

    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("No response from Groq");
    return text;
  }
}
