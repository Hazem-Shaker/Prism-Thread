import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { upload, handleUpload } from "./upload.controller";

const router = Router();

router.post("/", (req: Request, res: Response, next: NextFunction) => {
  upload.single("file")(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "File too large. Maximum size is 50 MB." });
        return;
      }
      res.status(400).json({ error: `Upload error: ${err.message}` });
      return;
    }
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    handleUpload(req, res);
  });
});

export default router;
