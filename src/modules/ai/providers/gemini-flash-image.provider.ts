import { env } from "../../../config/env";
import fs from "fs";
import path from "path";
import crypto from "crypto";

/** Nano Banana 2 — often no free-tier quota (limit 0 on many keys). */
const GEMINI_IMAGE_3_1 = "gemini-3.1-flash-image-preview";
/** Nano Banana (2.5) — usually available on free tier when 3.1 is not. */
const GEMINI_IMAGE_2_5 = "gemini-2.5-flash-image";

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const GENERATED_DIR = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "public",
  "generated"
);

interface Part {
  text?: string;
  inline_data?: { mime_type?: string; data?: string };
  inlineData?: { mimeType?: string; data?: string };
}

interface GeminiImageResponse {
  candidates?: Array<{ content?: { parts?: Part[] } }>;
  error?: { message: string };
}

function extensionForMime(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "png";
}

function firstImagePart(parts: Part[] | undefined): {
  base64: string;
  ext: string;
} | null {
  if (!parts) return null;
  for (const part of parts) {
    const inline = part.inline_data ?? part.inlineData;
    const data = inline?.data;
    if (!data) continue;
    const mime =
      part.inline_data?.mime_type ??
      part.inlineData?.mimeType ??
      "image/png";
    return { base64: data, ext: extensionForMime(mime) };
  }
  return null;
}

function modelCandidates(): string[] {
  if (env.geminiImageModel) {
    return [env.geminiImageModel];
  }
  /** 2.5 first: free tier often has quota 0 for 3.1 image (Nano Banana 2). */
  return [GEMINI_IMAGE_2_5, GEMINI_IMAGE_3_1];
}

type AttemptResult =
  | { ok: true; publicPath: string; modelId: string }
  | { ok: false; status: number; body: string; modelId: string };

async function attemptGenerate(
  modelId: string,
  prompt: string
): Promise<AttemptResult> {
  const res = await fetch(
    `${GEMINI_BASE}/${modelId}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.geminiApiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    }
  );

  const body = await res.text();

  if (res.status === 429) {
    return { ok: false, status: 429, body, modelId };
  }

  if (!res.ok) {
    return { ok: false, status: res.status, body, modelId };
  }

  let data: GeminiImageResponse;
  try {
    data = JSON.parse(body) as GeminiImageResponse;
  } catch {
    return {
      ok: false,
      status: res.status,
      body: "Invalid JSON from Gemini",
      modelId,
    };
  }

  if (data.error) {
    return {
      ok: false,
      status: res.status,
      body: data.error.message,
      modelId,
    };
  }

  const img = firstImagePart(data.candidates?.[0]?.content?.parts);
  if (!img) {
    return {
      ok: false,
      status: 502,
      body:
        "No image in response (text-only or unsupported output for this model).",
      modelId,
    };
  }

  const buffer = Buffer.from(img.base64, "base64");
  const filename = `${crypto.randomUUID()}.${img.ext}`;

  if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
  }

  fs.writeFileSync(path.join(GENERATED_DIR, filename), buffer);

  return {
    ok: true,
    publicPath: `/generated/${filename}`,
    modelId,
  };
}

function userFacingHttpError(status: number, body: string): string {
  try {
    const j = JSON.parse(body) as { error?: { message?: string } };
    const m = j.error?.message;
    if (m) return m.length > 800 ? `${m.slice(0, 800)}…` : m;
  } catch {
    /* ignore */
  }
  return body.length > 400 ? `${body.slice(0, 400)}…` : body;
}

export type GeminiImageOutcome =
  | { ok: true; publicPath: string }
  | { ok: false; quotaExhausted: boolean; message: string };

/**
 * Gemini-only image generation. On full quota failure, callers can fall back (e.g. Hugging Face).
 */
export async function generateImageGemini(
  prompt: string
): Promise<GeminiImageOutcome> {
  if (!env.geminiApiKey) {
    return {
      ok: false,
      quotaExhausted: false,
      message:
        "Gemini API key missing. Set GEMINI_API_KEY (https://aistudio.google.com/apikey) for Gemini images, " +
        "or leave it unset to use the free Pollinations image backend only.",
    };
  }

  const models = modelCandidates();
  const rateLimitBodies: string[] = [];

  for (const modelId of models) {
    const r = await attemptGenerate(modelId, prompt);
    if (r.ok) {
      if (models.length > 1 && modelId !== models[0]) {
        console.log(
          `Gemini image: used ${modelId} after ${models[0]} was unavailable (quota/rate limit or error).`
        );
      }
      return { ok: true, publicPath: r.publicPath };
    }

    if (r.status === 429) {
      rateLimitBodies.push(`${modelId}: ${userFacingHttpError(r.status, r.body)}`);
      continue;
    }

    return {
      ok: false,
      quotaExhausted: false,
      message: `Gemini image (${r.status}) with ${r.modelId}: ${userFacingHttpError(r.status, r.body)}`,
    };
  }

  const detail =
    rateLimitBodies.length > 0 ? ` Technical detail: ${rateLimitBodies.join(" | ")}` : "";

  return {
    ok: false,
    quotaExhausted: true,
    message:
      "Google Gemini image APIs returned 429 for every model tried. " +
      "A limit of 0 on free_tier usually means this API key’s project has no free image quota " +
      "(enable billing on the Google Cloud project linked to the key, or use a project that includes image models). " +
      "This app will fall back to free Pollinations image generation when Gemini quota is exhausted." +
      detail,
  };
}
