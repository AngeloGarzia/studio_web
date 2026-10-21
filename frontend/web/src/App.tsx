import React from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { api } from "./lib/api";
import { isManagerRole } from "./lib/roles";

import { HomePage } from "./pages/HomePage";
import { InfosPratiquesPage } from "./pages/InfosPratiquesPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { LoginPage } from "./pages/LoginPage";
import { ChoosePasswordPage } from "./pages/ChoosePasswordPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ClientBookingsPage } from "./pages/ClientBookingsPage";
import { ChatPage } from "./pages/ChatPage";

import { AdminCalendarPage } from "./pages/admin/AdminCalendarPage";
import { AdminPortfolioPage } from "./pages/admin/AdminPortfolioPage";
import { AdminSettingsPage } from "./pages/admin/AdminSettingsPage";
import { AdminAccessLogsPage } from "./pages/admin/AdminAccessLogsPage";
import { AdminQuittancePage } from "./pages/admin/AdminQuittancePage";
import { AdminEstablishmentsPage } from "./pages/admin/AdminEstablishmentsPage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import { AdminTenantsPage } from "./pages/admin/AdminTenantsPage";

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
  const [activeEstablishment, setActiveEstablishment] = React.useState<string | null>(null);

  React.useEffect(() => {
    void api.publicPing().catch(() => {});
  }, []);

  React.useEffect(() => {
    if (state.status !== "authed" || !isManagerRole(state.me.role)) {
      setActiveEstablishment(null);
      return;
    }
    let cancelled = false;
    void api
      .adminEstablishments()
      .then((rows) => {
        if (!cancelled) setActiveEstablishment(rows.find((row) => row.active)?.name ?? null);
      })
      .catch(() => {
        if (!cancelled) setActiveEstablishment(null);
      });
    return () => {
      cancelled = true;
    };
  }, [state, location.key]);

  React.useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  React.useEffect(() => {
    if (state.status !== "authed" || !isManagerRole(state.me.role)) {
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
    burgerChatUnread && state.status === "authed" && isManagerRole(state.me.role) && !open;

  const burgerAttentionTitle = burgerChatUnread ? "Attention — message client non lu" : "";

  const burgerAria =
    open ? "Fermer le menu" : showBurgerAttention ? "Ouvrir le menu — message client non lu" : "Ouvrir le menu";

  return (
    <div className="sdg-bg min-h-dvh">
      {!open ? (
        <button
          type="button"
          className="sdg-nav-burger fixed z-[70] hidden md:flex"
          style={{
            top: "max(1rem, env(safe-area-inset-top, 0px))",
            left: "max(1rem, env(safe-area-inset-left, 0px))"
          }}
          aria-label={burgerAria}
          aria-expanded={false}
          onClick={() => setOpen(true)}
        >
          {showBurgerAttention ? (
            <span
              className="sdg-burger-attention-blink pointer-events-none absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-md ring-2 ring-white"
              title={burgerAttentionTitle}
            >
              <AttentionMark className="h-3 w-3" />
            </span>
          ) : null}
          <BurgerIcon open={false} />
        </button>
      ) : null}

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[55] hidden bg-slate-900/35 md:block"
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
          />
          <nav
            className="sdg-nav-drawer fixed left-0 top-0 z-[60] hidden h-full max-h-dvh w-[min(20rem,86vw)] flex-col overflow-y-auto md:flex"
            style={{
              paddingTop: "max(1rem, env(safe-area-inset-top, 0px))",
              paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))"
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-4">
              <div className="flex min-w-0 items-center gap-2 pt-1">
                <img src="/devi.svg" alt="" className="h-10 w-10 shrink-0" />
                <div className="min-w-0">
                  <div className="sdg-nav-brand min-w-0">Studio des Grenadiers</div>
                  {activeEstablishment ? (
                    <div className="truncate text-xs font-semibold text-water-800">{activeEstablishment}</div>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="sdg-nav-burger shrink-0 !h-10 !w-10 !shadow-none"
                aria-label="Fermer le menu"
                onClick={() => setOpen(false)}
              >
                <BurgerIcon open />
              </button>
            </div>
            <div className="border-t border-slate-200 px-4 py-4">
              <div className="flex flex-col gap-0.5">
                <NavLinkItem to="/" onNavigate={() => setOpen(false)} end>
                  Accueil
                </NavLinkItem>
                <NavLinks state={state} chatUnread={showBurgerAttention} placement="drawer" onNavigate={() => setOpen(false)} />
              </div>
            </div>
            <div className="sdg-nav-footer mt-auto px-4 py-4">
              <AuthActions state={state} onLogout={logout} onNavigate={() => setOpen(false)} />
            </div>
          </nav>
        </>
      ) : null}

      <nav className="sdg-nav-bottom md:hidden" aria-label="Navigation">
        <div className="sdg-nav-bottom-scroll">
          <NavLinkItem to="/" onNavigate={() => setOpen(false)} end>
            Accueil
          </NavLinkItem>
          <NavLinks state={state} chatUnread={showBurgerAttention} placement="bar" onNavigate={() => setOpen(false)} />
          <AuthActions state={state} layout="bar" onLogout={logout} onNavigate={() => setOpen(false)} />
        </div>
      </nav>

      <div className="sdg-shell-main">
        {activeEstablishment ? (
          <div className="sdg-est-banner border-b border-water-100 bg-white/80 px-4 py-2 text-center text-sm font-semibold text-water-900">
            Établissement : {activeEstablishment}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function NavLinkItem({
  to,
  onNavigate,
  children,
  end,
  badge
}: {
  to: string;
  onNavigate: () => void;
  children: React.ReactNode;
  end?: boolean;
  badge?: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const active = end
    ? location.pathname === to
    : location.pathname === to || location.pathname.startsWith(`${to}/`);
  return (
    <Link
      className={`sdg-nav-link${active ? " sdg-nav-link-active" : ""}`}
      to={to}
      onClick={(event) => {
        onNavigate();
        if (to !== "/") return;
        event.preventDefault();
        navigate("/", { state: { catalogTick: Date.now() } });
      }}
      aria-current={active ? "page" : undefined}
    >
      <span className="inline-flex items-center gap-1.5">
        {children}
        {badge ? <AttentionMark className="h-3.5 w-3.5 shrink-0 text-amber-500" /> : null}
      </span>
    </Link>
  );
}

const OWNER_NAV = [
  { to: "/admin/calendrier", label: "Calendrier" },
  { to: "/admin/quittance", label: "Quittance" },
  { to: "/admin/portfolio", label: "Médias" },
  { to: "/admin/locataires", label: "Locataire" }
] as const;

function pathIsOwnerSection(pathname: string) {
  return OWNER_NAV.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
}

function OwnerNavGroup({ onNavigate, placement }: { onNavigate: () => void; placement: "drawer" | "bar" }) {
  const location = useLocation();
  const sectionActive = pathIsOwnerSection(location.pathname);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = React.useState(placement === "drawer" && sectionActive);

  React.useEffect(() => {
    if (placement === "bar") setExpanded(false);
    else if (sectionActive) setExpanded(true);
  }, [location.pathname, placement, sectionActive]);

  React.useEffect(() => {
    if (!expanded || placement !== "bar") return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setExpanded(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded, placement]);

  const close = () => {
    setExpanded(false);
    onNavigate();
  };

  return (
    <div ref={rootRef} className={placement === "bar" ? "relative shrink-0" : undefined}>
      <button
        type="button"
        className={`sdg-nav-link sdg-nav-group-btn${sectionActive ? " sdg-nav-link-active" : ""}`}
        aria-expanded={expanded}
        aria-controls={`sdg-owner-nav-${placement}`}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="flex items-center justify-between gap-2">
          Propriétaire
          <svg
            className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </span>
      </button>
      {expanded && placement === "drawer" ? (
        <div id={`sdg-owner-nav-${placement}`} className="sdg-nav-sub ml-3 border-l border-slate-200 pl-1">
          {OWNER_NAV.map((item) => (
            <NavLinkItem key={item.to} to={item.to} onNavigate={close}>
              {item.label}
            </NavLinkItem>
          ))}
        </div>
      ) : null}
      {expanded && placement === "bar" ? (
        <div id={`sdg-owner-nav-${placement}`} className="sdg-nav-owner-panel" role="menu">
          {OWNER_NAV.map((item) => (
            <NavLinkItem key={item.to} to={item.to} onNavigate={close}>
              {item.label}
            </NavLinkItem>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NavLinks({
  state,
  onNavigate,
  chatUnread,
  placement
}: {
  state: ReturnType<typeof useAuth>["state"];
  onNavigate: () => void;
  chatUnread?: boolean;
  placement: "drawer" | "bar";
}) {
  return (
    <>
      <NavLinkItem to="/infos-pratiques" onNavigate={onNavigate}>
        Infos
      </NavLinkItem>
      <NavLinkItem to="/portfolio" onNavigate={onNavigate}>
        Portfolio
      </NavLinkItem>
      <NavLinkItem to="/chat" onNavigate={onNavigate} badge={chatUnread}>
        Messages
      </NavLinkItem>
      {state.status === "authed" && state.me.role === "CLIENT" && (
        <NavLinkItem to="/mon-compte" onNavigate={onNavigate}>
          Mes réservations
        </NavLinkItem>
      )}
      {state.status === "authed" && isManagerRole(state.me.role) && (
        <>
          <NavLinkItem to="/admin/etablissements" onNavigate={onNavigate}>
            Établissements
          </NavLinkItem>
          <NavLinkItem to="/admin/utilisateurs" onNavigate={onNavigate}>
            Utilisateurs
          </NavLinkItem>
          <OwnerNavGroup onNavigate={onNavigate} placement={placement} />
          <NavLinkItem to="/admin/acces" onNavigate={onNavigate}>
            Logs d’accès
          </NavLinkItem>
          <NavLinkItem to="/admin/parametres" onNavigate={onNavigate}>
            Paramètres
          </NavLinkItem>
        </>
      )}
    </>
  );
}

function AuthActions({
  state,
  onLogout,
  onNavigate,
  layout = "stack"
}: {
  state: ReturnType<typeof useAuth>["state"];
  onLogout: () => Promise<void>;
  onNavigate: () => void;
  layout?: "stack" | "bar";
}) {
  if (layout === "bar") {
    if (state.status === "authed") {
      return (
        <button type="button" className="sdg-nav-link sdg-nav-bar-btn" onClick={() => void onLogout()}>
          Déconnexion
        </button>
      );
    }
    return (
      <>
        <Link className="sdg-nav-link" to="/connexion" onClick={onNavigate}>
          Connexion
        </Link>
      </>
    );
  }

  if (state.status === "authed") {
    return (
      <div className="flex flex-col gap-3">
        <div className="sdg-nav-user">{state.me.email}</div>
        <button type="button" className="sdg-btn-soft w-full" onClick={() => void onLogout()}>
          Déconnexion
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Link className="sdg-btn-primary w-full" to="/connexion" onClick={onNavigate}>
        Connexion
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
  if (!isManagerRole(state.me.role)) return <Navigate to="/" replace />;
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
          <Route path="/choisir-mot-de-passe" element={<ChoosePasswordPage />} />
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
            path="/admin/etablissements"
            element={
              <RequireAdmin>
                <AdminEstablishmentsPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/utilisateurs"
            element={
              <RequireAdmin>
                <AdminUsersPage />
              </RequireAdmin>
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
            path="/admin/quittance"
            element={
              <RequireAdmin>
                <AdminQuittancePage />
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
            path="/admin/locataires"
            element={
              <RequireAdmin>
                <AdminTenantsPage />
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

