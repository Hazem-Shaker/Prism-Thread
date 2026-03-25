import { env } from "../../../config/env";
import { AIProvider, ChatMessage } from "../ai.types";

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiResponse {
  candidates?: Array<{
    content: { parts: Array<{ text?: string }>; role: string };
    finishReason: string;
  }>;
  error?: { message: string };
}

export class GeminiProvider implements AIProvider {
  constructor(private modelId: string) {}

  async generateReply(messages: ChatMessage[]): Promise<string> {
    const contents = messages.map((m) => {
      const parts: any[] = [{ text: m.content }];

      if (m.attachments) {
        for (const att of m.attachments) {
          if (att.type === "image") {
            parts.push({
              inline_data: { mime_type: att.mimeType, data: att.data },
            });
          }
        }
      }

      return { role: m.role, parts };
    });

    const res = await fetch(`${GEMINI_BASE}/${this.modelId}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.geminiApiKey,
      },
      body: JSON.stringify({ contents }),
    });

    if (!res.ok) {
      throw new Error(`Gemini error (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as GeminiResponse;

    if (data.error) throw new Error(`Gemini: ${data.error.message}`);

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No response from Gemini");
    return text;
  }
}
