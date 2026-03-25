import { Request, Response } from "express";
import multer from "multer";
import { PDFParse } from "pdf-parse";

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const TEXT_EXTS = [".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml", ".log"];

const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

export async function handleUpload(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const mime = file.mimetype;
    const name = file.originalname;
    const ext = name.substring(name.lastIndexOf(".")).toLowerCase();

    if (IMAGE_MIMES.includes(mime)) {
      const base64 = file.buffer.toString("base64");
      res.json({
        type: "image",
        data: base64,
        mimeType: mime,
        filename: name,
      });
      return;
    }

    if (mime === "application/pdf" || ext === ".pdf") {
      const parser = new PDFParse({ data: new Uint8Array(file.buffer) });
      const result = await parser.getText();
      const text = result.pages.map((p) => p.text).join("\n\n");
      await parser.destroy();
      res.json({
        type: "file",
        data: text,
        mimeType: "text/plain",
        filename: name,
      });
      return;
    }

    if (TEXT_EXTS.includes(ext) || mime.startsWith("text/")) {
      const text = file.buffer.toString("utf-8");
      res.json({
        type: "file",
        data: text,
        mimeType: "text/plain",
        filename: name,
      });
      return;
    }

    res.status(400).json({
      error: `Unsupported file type: ${mime} (${ext})`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
