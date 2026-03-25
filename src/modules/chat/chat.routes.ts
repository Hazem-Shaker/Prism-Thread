import { Router } from "express";
import * as chatController from "./chat.controller";

const router = Router();

router.get("/", chatController.listConversations);
router.post("/", chatController.createConversation);
router.get("/:id", chatController.getConversation);
router.delete("/:id", chatController.deleteConversation);
router.post("/:id/messages", chatController.sendMessage);

export default router;
