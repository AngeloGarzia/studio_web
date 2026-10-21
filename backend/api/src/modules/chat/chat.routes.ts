import { Router } from "express";
import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import type { ChatController } from "./chat.controller.js";

export function createChatRouter(controller: ChatController): Router {
  const r = Router();
  r.get("/chat/conversation", requireAuth, controller.conversation);
  r.get("/chat/admin-unread", requireAdmin, controller.adminUnread);
  r.get("/chat/messages/:conversationId", requireAuth, controller.listMessages);
  r.post("/chat/messages/:conversationId", requireAuth, controller.send);
  return r;
}
