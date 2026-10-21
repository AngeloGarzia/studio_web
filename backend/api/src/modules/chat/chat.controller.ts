import type { Response } from "express";
import type { AuthedRequest } from "../../middleware/auth.js";
import { asyncHandler, routeParam } from "../../shared/http.js";
import { SendMessageBodySchema } from "./chat.dto.js";
import type { ChatService } from "./chat.service.js";

export class ChatController {
  constructor(private readonly chat: ChatService) {}

  conversation = asyncHandler(async (req: AuthedRequest, res: Response) => {
    return res.json(await this.chat.getConversation(req.auth!.sub, req.auth!.role));
  });

  adminUnread = asyncHandler(async (_req, res) => {
    return res.json(await this.chat.adminUnreadCount());
  });

  listMessages = asyncHandler(async (req: AuthedRequest, res: Response) => {
    return res.json(
      await this.chat.listMessages(routeParam(req, "conversationId"), req.auth!.sub, req.auth!.role)
    );
  });

  send = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = SendMessageBodySchema.parse(req.body);
    return res.json(
      await this.chat.sendMessage(routeParam(req, "conversationId"), req.auth!.sub, req.auth!.role, body)
    );
  });
}
