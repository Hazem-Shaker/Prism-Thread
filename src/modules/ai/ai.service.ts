import { env } from "../../config/env";
import { AIProvider, Capability, ChatMessage, ModelInfo } from "./ai.types";
import { GeminiProvider } from "./providers/gemini.provider";
import { GroqProvider } from "./providers/groq.provider";
import { OpenRouterProvider } from "./providers/openrouter.provider";

interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  apiKeyField: keyof typeof env;
  providerModelId: string;
  capabilities: Capability[];
}

const MODEL_CATALOG: ModelEntry[] = [
  {
    id: "gemini-flash",
    name: "Gemini 3 Flash",
    provider: "Google",
    apiKeyField: "geminiApiKey",
    providerModelId: "gemini-3-flash-preview",
    capabilities: ["chat", "vision", "file"],
  },
  {
    id: "qwen3-32b",
    name: "Qwen 3 32B",
    provider: "Groq",
    apiKeyField: "groqApiKey",
    providerModelId: "qwen/qwen3-32b",
    capabilities: ["chat", "file"],
  },
  {
    id: "step-3.5-flash-free",
    name: "Step 3.5 Flash",
    provider: "OpenRouter",
    apiKeyField: "openRouterApiKey",
    providerModelId: "stepfun/step-3.5-flash:free",
    capabilities: ["chat", "file"],
  },
  {
    id: "black-forest-labs-FLUX-1-dev",
    name: "black-forest-labs/FLUX.1-dev",
    provider: "Hugging Face",
    apiKeyField: "huggingfaceApiKey",
    providerModelId: "black-forest-labs/FLUX.1-dev",
    capabilities: ["imageGen"],
  },
];

function createProvider(entry: ModelEntry): AIProvider {
  switch (entry.provider) {
    case "Google":
      return new GeminiProvider(entry.providerModelId);
    case "Groq":
      return new GroqProvider(entry.providerModelId);
    case "OpenRouter":
      return new OpenRouterProvider(entry.providerModelId);
    default:
      throw new Error(`Unknown provider: ${entry.provider}`);
  }
}

export function getAvailableModels(): ModelInfo[] {
  return MODEL_CATALOG.map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.provider,
    available: !!env[m.apiKeyField],
    capabilities: m.capabilities,
  }));
}

export function getModelCapabilities(modelId: string): Capability[] {
  const entry = MODEL_CATALOG.find((m) => m.id === modelId);
  return entry ? entry.capabilities : [];
}

export async function generateReply(
  modelId: string,
  messages: ChatMessage[]
): Promise<string> {
  const entry = MODEL_CATALOG.find((m) => m.id === modelId);
  if (!entry) throw new Error(`Unknown model: ${modelId}`);
  if (!env[entry.apiKeyField]) {
    throw new Error(
      `API key for ${entry.provider} is not configured. Set ${entry.apiKeyField} in .env`
    );
  }

  const provider = createProvider(entry);
  const raw = await provider.generateReply(messages);
  return stripThinkingTags(raw);
}

function stripThinkingTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
}

export async function generateTitle(
  userMessage: string,
  modelReply: string
): Promise<string> {
  const prompt =
    "Generate a short, descriptive title (max 6 words) for a conversation that starts with this exchange. " +
    "Return ONLY the title text, no quotes, no punctuation at the end.\n\n" +
    `User: ${userMessage}\nAssistant: ${modelReply}`;

  try {
    const titleModel =
      MODEL_CATALOG.find((m) => m.provider === "Google" && !!env[m.apiKeyField]) ||
      MODEL_CATALOG.find((m) => m.capabilities.includes("chat") && !!env[m.apiKeyField]);

    if (!titleModel) return userMessage.substring(0, 40);

    const provider = createProvider(titleModel);
    const title = await provider.generateReply([
      { role: "user", content: prompt },
    ]);
    return title.trim() || userMessage.substring(0, 40);
  } catch {
    return userMessage.substring(0, 40);
  }
}
