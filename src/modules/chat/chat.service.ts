import { Conversation, IConversation, IAttachment } from "./chat.model";
import { generateReply, generateTitle } from "../ai/ai.service";
import { Attachment } from "../ai/ai.types";

export async function getAllConversations(): Promise<
  Pick<IConversation, "_id" | "title" | "updatedAt">[]
> {
  return Conversation.find({}, { title: 1, updatedAt: 1 })
    .sort({ updatedAt: -1 })
    .lean();
}

export async function createConversation(): Promise<IConversation> {
  const conversation = new Conversation();
  return conversation.save();
}

export async function getConversationById(
  id: string
): Promise<IConversation | null> {
  return Conversation.findById(id);
}

export async function deleteConversation(id: string): Promise<boolean> {
  const result = await Conversation.findByIdAndDelete(id);
  return result !== null;
}

export async function sendMessage(
  conversationId: string,
  userMessage: string,
  modelId: string,
  attachments?: IAttachment[]
): Promise<{
  userMsg: { role: string; content: string; attachments?: IAttachment[]; imageUrl?: string };
  modelMsg: { role: string; content: string; imageUrl?: string };
  title?: string;
}> {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const isFirstMessage = conversation.messages.length === 0;

  conversation.messages.push({
    role: "user",
    content: userMessage,
    timestamp: new Date(),
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
  });

  let fileContext = "";
  if (attachments) {
    for (const att of attachments) {
      if (att.type === "file" && att.data) {
        fileContext += `\n\n[File: ${att.filename || "uploaded file"}]\n${att.data}\n`;
      }
    }
  }

  const aiMessages = conversation.messages.map((m) => {
    const aiAttachments: Attachment[] | undefined = m.attachments
      ?.filter((a) => a.type === "image")
      .map((a) => ({
        type: a.type as "image",
        data: a.data,
        mimeType: a.mimeType,
        filename: a.filename,
      }));

    let content = m.content;
    if (m === conversation.messages[conversation.messages.length - 1] && fileContext) {
      content = content + fileContext;
    }

    return {
      role: m.role,
      content,
      attachments: aiAttachments && aiAttachments.length > 0 ? aiAttachments : undefined,
    };
  });

  const replyText = await generateReply(modelId, aiMessages);

  conversation.messages.push({
    role: "model",
    content: replyText,
    timestamp: new Date(),
  });

  if (isFirstMessage) {
    conversation.title = await generateTitle(userMessage, replyText);
  }

  await conversation.save();

  const storedAttachments = attachments?.map((a) => ({
    ...a,
    data: a.type === "image" ? "" : a.data,
  }));

  return {
    userMsg: {
      role: "user",
      content: userMessage,
      attachments: storedAttachments,
    },
    modelMsg: { role: "model", content: replyText },
    title: isFirstMessage ? conversation.title : undefined,
  };
}

export async function addImageMessage(
  conversationId: string,
  prompt: string,
  imageUrl: string
): Promise<{
  userMsg: { role: string; content: string };
  modelMsg: { role: string; content: string; imageUrl: string };
  title?: string;
}> {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new Error("Conversation not found");

  const isFirstMessage = conversation.messages.length === 0;

  conversation.messages.push({
    role: "user",
    content: prompt,
    timestamp: new Date(),
  });

  conversation.messages.push({
    role: "model",
    content: "Here's the generated image:",
    timestamp: new Date(),
    imageUrl,
  });

  if (isFirstMessage) {
    conversation.title = `Image: ${prompt.substring(0, 30)}`;
  }

  await conversation.save();

  return {
    userMsg: { role: "user", content: prompt },
    modelMsg: { role: "model", content: "Here's the generated image:", imageUrl },
    title: isFirstMessage ? conversation.title : undefined,
  };
}
