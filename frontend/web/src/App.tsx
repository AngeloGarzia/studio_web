import React from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { api } from "./lib/api";

import { HomePage } from "./pages/HomePage";
import { InfosPratiquesPage } from "./pages/InfosPratiquesPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ClientBookingsPage } from "./pages/ClientBookingsPage";
import { ChatPage } from "./pages/ChatPage";

import { AdminCalendarPage } from "./pages/admin/AdminCalendarPage";
import { AdminPortfolioPage } from "./pages/admin/AdminPortfolioPage";
import { AdminSettingsPage } from "./pages/admin/AdminSettingsPage";
import { AdminAccessLogsPage } from "./pages/admin/AdminAccessLogsPage";

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

function BurgerIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { state, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = React.useState(false);
  const [burgerChatUnread, setBurgerChatUnread] = React.useState(false);

  React.useEffect(() => {
    void api.publicPing().catch(() => {});
  }, []);

  React.useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  React.useEffect(() => {
    if (state.status !== "authed" || state.me.role !== "ADMIN") {
      setBurgerChatUnread(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const unreadChat = await api.chatAdminUnread();
        if (cancelled) return;
        const n = Number((unreadChat as { count?: unknown }).count);
        setBurgerChatUnread(Number.isFinite(n) && n > 0);
      } catch {
        if (!cancelled) setBurgerChatUnread(false);
      }
    };
    void run();
    const intervalMs = location.pathname === "/chat" ? 4000 : 30000;
    const iv = window.setInterval(run, intervalMs);
    const onFocus = () => void run();
    window.addEventListener("focus", onFocus);

    const bounceTimers: number[] = [];
    if (location.pathname === "/chat") {
      bounceTimers.push(window.setTimeout(() => void run(), 350), window.setTimeout(() => void run(), 1100));
    }

    return () => {
      cancelled = true;
      window.clearInterval(iv);
      window.removeEventListener("focus", onFocus);
      for (const t of bounceTimers) window.clearTimeout(t);
    };
  }, [state, location.pathname]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const showBurgerAttention =
    burgerChatUnread && state.status === "authed" && state.me.role === "ADMIN" && !open;

  const burgerAttentionTitle = burgerChatUnread ? "Attention — message client non lu" : "";

  const burgerAria =
    open ? "Fermer le menu" : showBurgerAttention ? "Ouvrir le menu — message client non lu" : "Ouvrir le menu";

  return (
    <div className="sdg-bg min-h-dvh">
      <button
        type="button"
        className="fixed z-[70] flex h-11 w-11 items-center justify-center rounded-2xl border border-white/50 bg-white/85 text-slate-800 shadow-lg shadow-slate-900/10 backdrop-blur-md transition hover:bg-white"
        style={{
          top: "max(1rem, env(safe-area-inset-top, 0px))",
          left: "max(1rem, env(safe-area-inset-left, 0px))"
        }}
        aria-label={burgerAria}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {showBurgerAttention ? (
          <span
            className="sdg-burger-attention-blink pointer-events-none absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-md ring-2 ring-white"
            title={burgerAttentionTitle}
          >
            <AttentionMark className="h-3 w-3" />
          </span>
        ) : null}
        <BurgerIcon open={open} />
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[55] bg-slate-900/40 backdrop-blur-[2px]"
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
          />
          <nav
            className="fixed left-0 top-0 z-[60] flex h-full max-h-dvh w-[min(20rem,88vw)] flex-col overflow-y-auto border-r border-white/45 bg-white/92 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur-md"
            style={{ paddingTop: "max(1rem, env(safe-area-inset-top, 0px))" }}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <div className="pt-12">
              <div className="mb-4 border-b border-slate-200/80 pb-3 font-serif text-base font-bold tracking-tight text-slate-800">
                Studio des Grenadiers
              </div>
              <div className="flex flex-col gap-1">
                <Link
                  className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-white"
                  to="/"
                  onClick={() => setOpen(false)}
                >
                  Accueil
                </Link>
                <NavLinks state={state} onNavigate={() => setOpen(false)} mobile />
              </div>
            </div>
            <div className="mt-auto border-t border-slate-200/80 pt-4">
              <AuthActions state={state} onLogout={logout} onNavigate={() => setOpen(false)} mobile />
            </div>
          </nav>
        </>
      ) : null}

      <div>{children}</div>
    </div>
  );
}

function NavLinks({
  state,
  onNavigate,
  mobile
}: {
  state: ReturnType<typeof useAuth>["state"];
  onNavigate: () => void;
  mobile?: boolean;
}) {
  const linkClass = mobile
    ? "rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-white"
    : "rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-white/70";

  return (
    <>
      <Link className={linkClass} to="/portfolio" onClick={onNavigate}>
        Portfolio
      </Link>
      <Link className={linkClass} to="/infos-pratiques" onClick={onNavigate}>
        Infos pratiques
      </Link>
      <Link className={linkClass} to="/chat" onClick={onNavigate}>
        Messages
      </Link>
      {state.status === "authed" && state.me.role === "CLIENT" && (
        <Link className={linkClass} to="/mon-compte" onClick={onNavigate}>
          Mes réservations
        </Link>
      )}
      {state.status === "authed" && state.me.role === "ADMIN" && (
        <>
          <Link className={linkClass} to="/admin/calendrier" onClick={onNavigate}>
            Calendrier
          </Link>
          <Link className={linkClass} to="/admin/portfolio" onClick={onNavigate}>
            Médias
          </Link>
          <Link className={linkClass} to="/chat" onClick={onNavigate}>
            Messages
          </Link>
          <Link className={linkClass} to="/admin/acces" onClick={onNavigate}>
            Logs accès
          </Link>
          <Link className={linkClass} to="/admin/parametres" onClick={onNavigate}>
            Paramètres
          </Link>
        </>
      )}
    </>
  );
}

function AuthActions({
  state,
  onLogout,
  onNavigate,
  mobile
}: {
  state: ReturnType<typeof useAuth>["state"];
  onLogout: () => Promise<void>;
  onNavigate: () => void;
  mobile?: boolean;
}) {
  if (state.status === "authed") {
    return (
      <div className={mobile ? "flex flex-col gap-2" : "flex items-center gap-2"}>
        <span className="text-xs font-semibold text-slate-600">{state.me.email}</span>
        <button className="sdg-btn-soft" onClick={() => void onLogout()}>
          Déconnexion
        </button>
      </div>
    );
  }

  return (
    <div className={mobile ? "flex flex-col gap-2" : "flex items-center gap-2"}>
      <Link className="sdg-btn-soft" to="/connexion" onClick={onNavigate}>
        Connexion
      </Link>
      <Link className="sdg-btn-primary" to="/inscription" onClick={onNavigate}>
        Inscription
      </Link>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === "loading") return <div className="sdg-hero">Chargement…</div>;
  if (state.status === "anon") return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  if (state.status === "loading") return <div className="sdg-hero">Chargement…</div>;
  if (state.status !== "authed") return <Navigate to="/connexion" replace />;
  if (state.me.role !== "ADMIN") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <Shell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/infos-pratiques" element={<InfosPratiquesPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/connexion" element={<LoginPage />} />
          <Route path="/inscription" element={<RegisterPage />} />

          <Route
            path="/mon-compte"
            element={
              <RequireAuth>
                <ClientBookingsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/chat"
            element={
              <RequireAuth>
                <ChatPage />
              </RequireAuth>
            }
          />

          <Route
            path="/admin/calendrier"
            element={
              <RequireAdmin>
                <AdminCalendarPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/portfolio"
            element={
              <RequireAdmin>
                <AdminPortfolioPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/messages"
            element={
              <RequireAdmin>
                <Navigate to="/chat" replace />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/acces"
            element={
              <RequireAdmin>
                <AdminAccessLogsPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/parametres"
            element={
              <RequireAdmin>
                <AdminSettingsPage />
              </RequireAdmin>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </AuthProvider>
  );
}

