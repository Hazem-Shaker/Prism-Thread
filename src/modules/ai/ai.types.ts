export type Capability = "chat" | "vision" | "file" | "imageGen";

export interface Attachment {
  type: "image" | "file";
  data: string;
  mimeType: string;
  filename?: string;
}

export interface ChatMessage {
  role: "user" | "model";
  content: string;
  attachments?: Attachment[];
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  available: boolean;
  capabilities: Capability[];
}

export interface AIProvider {
  generateReply(messages: ChatMessage[]): Promise<string>;
}
