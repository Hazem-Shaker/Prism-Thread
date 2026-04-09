import { env } from "../../config/env";
import { generateImageGemini } from "./providers/gemini-flash-image.provider";
import { generateImagePollinations } from "./providers/pollinations-image.provider";

export async function generateImage(prompt: string): Promise<string> {
  if (env.geminiApiKey) {
    const g = await generateImageGemini(prompt);
    if (g.ok) return g.publicPath;
    if (!g.quotaExhausted) {
      throw new Error(g.message);
    }
    console.warn(
      "Gemini image: quota exhausted or unavailable; using free Pollinations fallback."
    );
  } else {
    console.warn(
      "GEMINI_API_KEY not set; using free Pollinations for image generation."
    );
  }

  return generateImagePollinations(prompt);
}
