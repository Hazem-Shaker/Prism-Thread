import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Free text-to-image via Pollinations (no API key or billing).
 * @see https://pollinations.ai — public service; availability and limits are outside our control.
 */

const GENERATED_DIR = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "public",
  "generated"
);

const MAX_PROMPT_CHARS = 1800;

function extensionForContentType(ct: string | null): string {
  if (!ct) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  return "png";
}

export async function generateImagePollinations(prompt: string): Promise<string> {
  const trimmed = prompt.trim().slice(0, MAX_PROMPT_CHARS);
  if (!trimmed) {
    throw new Error("Image prompt is empty.");
  }

  const pathSeg = encodeURIComponent(trimmed);
  const url =
    `https://image.pollinations.ai/prompt/${pathSeg}` +
    `?width=1024&height=1024&model=turbo&enhance=false`;

  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      Accept: "image/*,*/*;q=0.8",
      "User-Agent": "PrismThread/1.0 (image generation)",
    },
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(
      `Pollinations image (${res.status}): ${t.slice(0, 200) || res.statusText}`
    );
  }

  const ct = res.headers.get("content-type") || "";
  if (/text\/html|application\/json/i.test(ct)) {
    const snippet = (await res.text()).slice(0, 200);
    throw new Error(`Pollinations returned an error page (${ct}). ${snippet}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 100) {
    throw new Error("Pollinations returned an empty or invalid image.");
  }

  const ext = extensionForContentType(ct);
  const filename = `${crypto.randomUUID()}.${ext}`;

  if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
  }

  fs.writeFileSync(path.join(GENERATED_DIR, filename), buffer);

  return `/generated/${filename}`;
}
