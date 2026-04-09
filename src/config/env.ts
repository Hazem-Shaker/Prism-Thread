import dotenv from "dotenv";
dotenv.config();

export const env = {
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  /** If set, only this model is used. If empty, tries 2.5 image then 3.1. */
  geminiImageModel: (process.env.GEMINI_IMAGE_MODEL || "").trim(),
  groqApiKey: process.env.GROQ_API_KEY || "",
  openRouterApiKey: process.env.OPENROUTER_API_KEY || "",
  togetherApiKey: process.env.TOGETHER_API_KEY || "",
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/gemini-chat",
  port: parseInt(process.env.PORT || "3000", 10),
};
