import { Request, Response } from "express";
import multer from "multer";
import { env } from "../../config/env";

const storage = multer.memoryStorage();
export const audioUpload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

export async function transcribe(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!env.groqApiKey) {
      res.status(400).json({ error: "Groq API key is not configured for STT" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No audio file uploaded" });
      return;
    }

    const formData = new FormData();
    const blob = new Blob([file.buffer], { type: file.mimetype });
    formData.append("file", blob, file.originalname || "audio.webm");
    formData.append("model", "whisper-large-v3-turbo");

    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.groqApiKey}`,
        },
        body: formData,
      }
    );

    if (!groqRes.ok) {
      throw new Error(`Groq STT error (${groqRes.status}): ${await groqRes.text()}`);
    }

    const data = (await groqRes.json()) as { text: string };
    res.json({ text: data.text });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
