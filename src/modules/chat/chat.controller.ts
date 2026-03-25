import { Request, Response } from "express";
import * as chatService from "./chat.service";
import { getAvailableModels } from "../ai/ai.service";
import { generateImage } from "../ai/providers/black-forest-labs-FLUX-1-dev.provider";

interface ConversationParams {
  id: string;
}

export async function listModels(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const models = getAvailableModels();
    res.json(models);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function listConversations(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const conversations = await chatService.getAllConversations();
    res.json(conversations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function createConversation(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const conversation = await chatService.createConversation();
    res.status(201).json(conversation);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function getConversation(
  req: Request<ConversationParams>,
  res: Response
): Promise<void> {
  try {
    const conversation = await chatService.getConversationById(req.params.id);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.json(conversation);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function deleteConversation(
  req: Request<ConversationParams>,
  res: Response
): Promise<void> {
  try {
    const deleted = await chatService.deleteConversation(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function sendMessage(
  req: Request<ConversationParams>,
  res: Response
): Promise<void> {
  try {
    const { message, model, attachments } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Message is required" });
      return;
    }
    if (!model || typeof model !== "string") {
      res.status(400).json({ error: "Model selection is required" });
      return;
    }
    const result = await chatService.sendMessage(
      req.params.id,
      message,
      model,
      attachments
    );
    res.json(result);
  } catch (error: any) {
    if (error.message === "Conversation not found") {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error.message });
  }
}

export async function generateImageEndpoint(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { prompt, conversationId } = req.body;
    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }
    if (!conversationId || typeof conversationId !== "string") {
      res.status(400).json({ error: "Conversation ID is required" });
      return;
    }

    const imageUrl = await generateImage(prompt);
    const result = await chatService.addImageMessage(
      conversationId,
      prompt,
      imageUrl
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
