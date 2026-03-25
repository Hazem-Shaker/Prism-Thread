import mongoose, { Schema, Document } from "mongoose";

export interface IAttachment {
  type: "image" | "file";
  data: string;
  mimeType: string;
  filename?: string;
}

export interface IMessage {
  role: "user" | "model";
  content: string;
  timestamp: Date;
  attachments?: IAttachment[];
  imageUrl?: string;
}

export interface IConversation extends Document {
  title: string;
  messages: IMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<IAttachment>(
  {
    type: { type: String, enum: ["image", "file"], required: true },
    data: { type: String, default: "" },
    mimeType: { type: String, required: true },
    filename: { type: String },
  },
  { _id: false }
);

const messageSchema = new Schema<IMessage>(
  {
    role: { type: String, enum: ["user", "model"], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    attachments: { type: [attachmentSchema], default: undefined },
    imageUrl: { type: String },
  },
  { _id: false }
);

const conversationSchema = new Schema<IConversation>(
  {
    title: { type: String, default: "New Chat" },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true }
);

export const Conversation = mongoose.model<IConversation>(
  "Conversation",
  conversationSchema
);
