import type { ChatEmitter } from "../../infra/socket.js";
import { AppError } from "../../shared/http.js";
import type { SendMessageBody } from "./chat.dto.js";
import type { ChatRepository } from "./chat.repository.js";
import { isManagerRole, type AppRole } from "../../shared/roles.js";

export class ChatService {
  constructor(
    private readonly chat: ChatRepository,
    private readonly emitter: ChatEmitter
  ) {}

  async getConversation(userId: string, role: AppRole) {
    if (role === "CLIENT") {
      return this.chat.findOrCreateConversation(userId);
    }
    const convs = await this.chat.listConversationsWithClient();
    const unread = await this.chat.unreadCountsByConversation();
    const unreadByConv = new Map(unread.map((r) => [r.conversationId, r.count]));
    return convs.map((c) => ({ ...c, unreadForAdmin: unreadByConv.get(c.id) ?? 0 }));
  }

  adminUnreadCount() {
    return this.chat.countAdminUnread().then((count) => ({ count }));
  }

  async listMessages(conversationId: string, userId: string, role: AppRole) {
    if (role === "CLIENT") {
      const conv = await this.chat.findConversationByClient(userId);
      if (!conv || conv.id !== conversationId) throw new AppError("FORBIDDEN", 403);
    }
    if (isManagerRole(role)) {
      const conv = await this.chat.findById(conversationId);
      if (!conv) throw new AppError("NOT_FOUND", 404);
      await this.chat.markClientMessagesReadByAdmin(conversationId);
    }
    return this.chat.listMessages(conversationId);
  }

  async sendMessage(
    conversationId: string,
    userId: string,
    role: AppRole,
    body: SendMessageBody
  ) {
    if (role === "CLIENT") {
      const conv = await this.chat.findConversationByClient(userId);
      if (!conv || conv.id !== conversationId) throw new AppError("FORBIDDEN", 403);
    } else {
      const conv = await this.chat.findById(conversationId);
      if (!conv) throw new AppError("NOT_FOUND", 404);
    }
    const msg = await this.chat.createMessage({
      conversationId,
      senderId: userId,
      body: body.body
    });
    await this.chat.touchConversation(conversationId);
    this.emitter.emitNewMessage(conversationId, msg);
    return msg;
  }
}
