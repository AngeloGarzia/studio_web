import React from "react";
import { io } from "socket.io-client";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

function AttentionMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.577 4.5-2.598 4.5H4.644c-2.021 0-3.752-2.5-2.598-4.5L9.401 3.003zM12 8.25a.75.75 0 00-.75.75v3.75a.75.75 0 001.5 0V9a.75.75 0 00-.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
      />
    </svg>
  );
}

type ConvRow = {
  id: string;
  client?: { profileName?: string | null; email?: string | null } | null;
  clientId?: string;
  unreadForAdmin?: number;
};

export function ChatPage() {
  const { state } = useAuth();
  const [convs, setConvs] = React.useState<ConvRow[]>([]);
  const [activeConvId, setActiveConvId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<any[]>([]);
  const [body, setBody] = React.useState("");

  const refreshAdminConvs = React.useCallback(async () => {
    if (state.status !== "authed" || state.me.role !== "ADMIN") return;
    const c = await api.chatConversation();
    if (Array.isArray(c)) setConvs(c as ConvRow[]);
  }, [state.status, state.me.role]);

  React.useEffect(() => {
    void (async () => {
      const c = await api.chatConversation();
      if (Array.isArray(c)) {
        setConvs(c as ConvRow[]);
        setActiveConvId((prev) => prev ?? (c as ConvRow[])[0]?.id ?? null);
      } else {
        setConvs([c as ConvRow]);
        setActiveConvId((c as ConvRow).id);
      }
    })();
  }, []);

  React.useEffect(() => {
    if (!activeConvId) return;
    void (async () => {
      const m = await api.chatMessages(activeConvId);
      setMessages(m as any[]);
      if (state.status === "authed" && state.me.role === "ADMIN") await refreshAdminConvs();
    })();
  }, [activeConvId, state.status, state.me.role, refreshAdminConvs]);

  React.useEffect(() => {
    if (state.status !== "authed") return;
    if (state.me.role === "ADMIN") {
      if (convs.length === 0) return;
    } else if (!activeConvId) {
      return;
    }

    const socket = io("", { withCredentials: true, transports: ["websocket"] });
    const rooms =
      state.me.role === "ADMIN"
        ? convs.map((c) => `conv:${c.id}`)
        : activeConvId
          ? [`conv:${activeConvId}`]
          : [];
    for (const r of rooms) socket.emit("join", r);

    socket.on("chat:new_message", (payload: any) => {
      if (payload?.conversationId === activeConvId) {
        setMessages((prev) => [...prev, payload.message]);
      }
      if (state.me.role === "ADMIN") void refreshAdminConvs();
    });
    return () => socket.disconnect();
  }, [activeConvId, convs, state.status, state.me.role, refreshAdminConvs]);

  const send = async () => {
    if (!activeConvId || !body.trim()) return;
    const msg = await api.chatSend(activeConvId, body.trim());
    setMessages((prev) => [...prev, msg]);
    setBody("");
  };

  if (state.status !== "authed") return null;

  return (
    <div className="sdg-container py-10">
      <h1 className="sdg-title">Messagerie</h1>
      <p className="sdg-subtitle mt-2">Pose tes questions, demande des infos, ou gère les conversations en admin.</p>

      <div className="sdg-card mt-6 p-4 md:p-5">
        <div className={`grid gap-4 ${state.me.role === "ADMIN" ? "md:grid-cols-3" : "grid-cols-1"}`}>
          {state.me.role === "ADMIN" && (
            <div className="md:col-span-1">
              <div className="text-sm font-extrabold tracking-tight text-slate-900">Conversations</div>
              <div className="mt-3 space-y-2">
                {convs.map((c) => {
                  const active = c.id === activeConvId;
                  const unread = (c.unreadForAdmin ?? 0) > 0;
                  return (
                    <button
                      key={c.id}
                      className={`flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm font-semibold transition ${
                        active
                          ? "border-water-300 bg-water-50 text-water-900"
                          : "border-slate-200 bg-white/70 text-slate-800 hover:bg-white"
                      }`}
                      onClick={() => setActiveConvId(c.id)}
                    >
                      <span className="min-w-0 flex-1 truncate">{c.client?.profileName ?? c.client?.email ?? c.clientId}</span>
                      {unread ? (
                        <span
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm"
                          title="Nouveau message client"
                        >
                          <AttentionMark className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                {convs.length === 0 && <div className="text-sm text-slate-600">Aucune conversation.</div>}
              </div>
            </div>
          )}

          <div className={state.me.role === "ADMIN" ? "md:col-span-2" : ""}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-extrabold tracking-tight text-slate-900">Chat</div>
              <div className="text-xs font-semibold text-slate-500">
                {activeConvId ? "Connecté" : "Choisis une conversation"}
              </div>
            </div>

            <div className="mt-3 h-[420px] max-h-[min(420px,70vh)] min-h-[200px] overflow-auto rounded-2xl border border-slate-200 bg-white/70 p-3">
              {messages.map((m) => {
                const mine = m.senderId === state.me.id;
                return (
                  <div key={m.id} className={`mb-2 flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[min(520px,85vw)] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        mine ? "bg-water-600 text-white" : "bg-white text-slate-900"
                      }`}
                    >
                      <div className={`text-[11px] font-semibold ${mine ? "text-white/80" : "text-slate-500"}`}>
                        {new Date(m.createdAt).toLocaleString("fr-FR")}
                      </div>
                      <div className="mt-1 whitespace-pre-wrap">{m.body}</div>
                    </div>
                  </div>
                );
              })}
              {messages.length === 0 && <div className="text-sm text-slate-600">Aucun message.</div>}
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input className="sdg-input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Écrire un message…" />
              <button className="sdg-btn-primary sm:w-32" onClick={() => void send()}>
                Envoyer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
