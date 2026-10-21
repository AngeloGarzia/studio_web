import type { Conversation, Message, PrismaClient } from "@prisma/client";
import { currentEstablishmentId } from "../../shared/establishmentContext.js";

export interface ChatRepository {
  findOrCreateConversation(clientId: string): Promise<Conversation>;
  findConversationByClient(clientId: string): Promise<Conversation | null>;
  findById(id: string): Promise<Conversation | null>;
  listConversationsWithClient(): Promise<
    Array<Conversation & { client: { email: string; profileName: string | null } }>
  >;
  unreadCountsByConversation(): Promise<Array<{ conversationId: string; count: number }>>;
  countAdminUnread(): Promise<number>;
  markClientMessagesReadByAdmin(conversationId: string): Promise<void>;
  listMessages(conversationId: string): Promise<
    Array<
      Message & {
        sender: { role: string; profileName: string | null; email: string };
      }
    >
  >;
  createMessage(data: { conversationId: string; senderId: string; body: string }): Promise<Message>;
  touchConversation(id: string): Promise<void>;
}

export class PrismaChatRepository implements ChatRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findOrCreateConversation(clientId: string) {
    const establishmentId = currentEstablishmentId();
    return (
      (await this.prisma.conversation.findUnique({
        where: { clientId_establishmentId: { clientId, establishmentId } }
      })) ??
      (await this.prisma.conversation.create({ data: { clientId, establishmentId } }))
    );
  }

  findConversationByClient(clientId: string) {
    return this.prisma.conversation.findUnique({
      where: { clientId_establishmentId: { clientId, establishmentId: currentEstablishmentId() } }
    });
  }

  findById(id: string) {
    return this.prisma.conversation.findFirst({ where: { id, establishmentId: currentEstablishmentId() } });
  }

  listConversationsWithClient() {
    return this.prisma.conversation.findMany({
      where: { establishmentId: currentEstablishmentId() },
      orderBy: { updatedAt: "desc" },
      include: { client: { select: { email: true, profileName: true } } }
    });
  }

  async unreadCountsByConversation() {
    const unreadRows = await this.prisma.message.groupBy({
      by: ["conversationId"],
      where: {
        readByAdminAt: null,
        sender: { role: "CLIENT" },
        conversation: { establishmentId: currentEstablishmentId() }
      },
      _count: { _all: true }
    });
    return unreadRows.map((r) => ({ conversationId: r.conversationId, count: r._count._all }));
  }

  countAdminUnread() {
    return this.prisma.message.count({
      where: {
        readByAdminAt: null,
        sender: { role: "CLIENT" },
        conversation: { establishmentId: currentEstablishmentId() }
      }
    });
  }

  async markClientMessagesReadByAdmin(conversationId: string) {
    await this.prisma.message.updateMany({
      where: {
        conversationId,
        readByAdminAt: null,
        sender: { role: "CLIENT" }
      },
      data: { readByAdminAt: new Date() }
    });
  }

  listMessages(conversationId: string) {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      include: { sender: { select: { role: true, profileName: true, email: true } } }
    });
  }

  createMessage(data: { conversationId: string; senderId: string; body: string }) {
    return this.prisma.message.create({ data });
  }

  async touchConversation(id: string) {
    await this.prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
  }
}
