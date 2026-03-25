import dotenv from "dotenv";
dotenv.config();

/** Trim and strip accidental wrapping quotes from .env values */
function normalizeToken(v: string | undefined): string {
  if (!v) return "";
  let s = v.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export const env = {
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  groqApiKey: process.env.GROQ_API_KEY || "",
  openRouterApiKey: process.env.OPENROUTER_API_KEY || "",
  togetherApiKey: process.env.TOGETHER_API_KEY || "",
  huggingfaceApiKey: normalizeToken(
    process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN
  ),
  /** Optional: direct Fal API key if HF-routed fal-ai rejects the Hub token */
  falApiKey: normalizeToken(process.env.FAL_API_KEY),
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/gemini-chat",
  port: parseInt(process.env.PORT || "3000", 10),
};
