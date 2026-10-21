import type { Server, Socket } from "socket.io";

/** Abstraction temps réel — les services n’importent pas Socket.io. */
export interface ChatEmitter {
  emitNewMessage(conversationId: string, message: unknown): void;
}

export function createSocketChatEmitter(io: Server): ChatEmitter {
  return {
    emitNewMessage(conversationId, message) {
      io.to(`conv:${conversationId}`).emit("chat:new_message", { conversationId, message });
    }
  };
}

/** Comportement actuel : join libre de rooms (auth Socket hors scope de ce refactor). */
export function wireSocketJoin(io: Server): void {
  io.on("connection", (socket: Socket) => {
    socket.on("join", (room: string) => {
      socket.join(room);
    });
  });
}
