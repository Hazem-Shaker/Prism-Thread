import express from "express";
import path from "path";
import chatRoutes from "./modules/chat/chat.routes";
import uploadRoutes from "./modules/upload/upload.routes";
import sttRoutes from "./modules/stt/stt.routes";
import { listModels, generateImageEndpoint } from "./modules/chat/chat.controller";

const app = express();

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/models", listModels);
app.use("/api/conversations", chatRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/transcribe", sttRoutes);
app.post("/api/image/generate", generateImageEndpoint);

export default app;
