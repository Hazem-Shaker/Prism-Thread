import { Router } from "express";
import { audioUpload, transcribe } from "./stt.controller";

const router = Router();

router.post("/", audioUpload.single("audio"), transcribe);

export default router;
