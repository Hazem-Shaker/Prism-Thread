import { InferenceClient } from "@huggingface/inference";
import { env } from "../../../config/env";
import fs from "fs";
import path from "path";
import crypto from "crypto";

/** Matches Hugging Face repo id: black-forest-labs/FLUX.1-dev */
export const FLUX_1_DEV_MODEL_ID = "black-forest-labs/FLUX.1-dev";

/** HF router queue endpoint for Fal FLUX dev (see Hugging Face model “Deploy” snippets) */
const HF_FLUX_DEV_ROUTER_URL =
  "https://router.huggingface.co/fal-ai/fal-ai/flux/dev?_subdomain=queue";

const GENERATED_DIR = path.join(__dirname, "..", "..", "..", "..", "public", "generated");

const TEXT_TO_IMAGE_OPTS = { outputType: "blob" as const };

function isAuthLikeError(message: string): boolean {
  return /invalid username or password|invalid.*password|401|403|unauthoriz/i.test(
    message
  );
}

function explainInferenceLimits(): string {
  return (
    "The FLUX.1-dev weights are free on the Hub, but running the model still goes through " +
    "Hugging Face Inference Providers (paid or quota-backed), not unlimited free GPU. " +
    'Try: (1) Set provider order at https://huggingface.co/settings/inference-providers. ' +
    "(2) Ensure your HF token has Inference Providers permission and no extra quotes in .env. " +
    "(3) Optional: add FAL_API_KEY from https://fal.ai/dashboard if HF→Fal auth fails."
  );
}

async function fetchFluxDevViaRouter(
  prompt: string,
  token: string
): Promise<Blob> {
  const res = await fetch(HF_FLUX_DEV_ROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  return res.blob();
}

async function textToImageViaInferenceClient(
  prompt: string,
  hfToken: string,
  falOverrideToken?: string
): Promise<Blob> {
  const client = new InferenceClient(hfToken);
  const payload = {
    provider: "fal-ai" as const,
    model: FLUX_1_DEV_MODEL_ID,
    inputs: prompt,
    parameters: { num_inference_steps: 5 },
    ...(falOverrideToken ? { accessToken: falOverrideToken } : {}),
  };
  return client.textToImage(payload, TEXT_TO_IMAGE_OPTS);
}

function mapInferenceClientError(msg: string): Error | null {
  if (
    msg.includes("Inference Providers") ||
    msg.includes("sufficient permissions") ||
    msg.includes("authentication method")
  ) {
    return new Error(
      "Hugging Face: your token cannot call Inference Providers. " +
        "Create a fine-grained token at https://huggingface.co/settings/tokens with " +
        '"Make calls to Inference Providers" enabled, and accept the model license at ' +
        "https://huggingface.co/black-forest-labs/FLUX.1-dev"
    );
  }
  return null;
}

export async function generateImage(prompt: string): Promise<string> {
  if (!env.huggingfaceApiKey) {
    throw new Error(
      "Hugging Face token missing. Set HUGGINGFACE_API_KEY or HF_TOKEN in .env (https://huggingface.co/settings/tokens)"
    );
  }

  const token = env.huggingfaceApiKey;
  let image: Blob;

  try {
    image = await fetchFluxDevViaRouter(prompt, token);
  } catch (routerErr) {
    try {
      image = await textToImageViaInferenceClient(prompt, token);
    } catch (sdkErr) {
      const msg =
        sdkErr instanceof Error ? sdkErr.message : String(sdkErr);
      const mapped = mapInferenceClientError(msg);
      if (mapped) throw mapped;

      if (env.falApiKey && isAuthLikeError(msg)) {
        try {
          image = await textToImageViaInferenceClient(
            prompt,
            token,
            env.falApiKey
          );
        } catch {
          throw sdkErr;
        }
      } else if (isAuthLikeError(msg)) {
        const routerMsg =
          routerErr instanceof Error ? routerErr.message : String(routerErr);
        throw new Error(
          `Image generation failed (router: ${routerMsg}; SDK: ${msg})\n\n${explainInferenceLimits()}`
        );
      } else {
        throw sdkErr;
      }
    }
  }

  const buffer = Buffer.from(await image.arrayBuffer());
  const filename = crypto.randomUUID() + ".png";

  if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
  }

  fs.writeFileSync(path.join(GENERATED_DIR, filename), buffer);

  return `/generated/${filename}`;
}
