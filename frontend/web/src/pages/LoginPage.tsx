import React from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

const REMEMBER_KEY = "sdg_remember_login";

type RememberedLogin = { email: string; password: string };

function readRemembered(): RememberedLogin | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedLogin>;
    if (typeof parsed.email !== "string" || typeof parsed.password !== "string") return null;
    return { email: parsed.email, password: parsed.password };
  } catch {
    return null;
  }
}

function writeRemembered(email: string, password: string) {
  localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, password }));
}

function clearRemembered() {
  localStorage.removeItem(REMEMBER_KEY);
}

export function LoginPage() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const remembered = React.useMemo(() => readRemembered(), []);
  const [email, setEmail] = React.useState(remembered?.email ?? "");
  const [password, setPassword] = React.useState(remembered?.password ?? "");
  const [remember, setRemember] = React.useState(Boolean(remembered));
  const [error, setError] = React.useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = React.useState(false);
  const [forgotEmail, setForgotEmail] = React.useState(remembered?.email ?? "");
  const [forgotBusy, setForgotBusy] = React.useState(false);
  const [forgotMsg, setForgotMsg] = React.useState<string | null>(null);
  const [forgotError, setForgotError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.login(email, password);
      if (remember) writeRemembered(email.trim(), password);
      else clearRemembered();
      setPassword("");
      await refresh();
      nav("/");
    } catch (err: any) {
      setPassword("");
      const code = err?.error;
      if (code === "ACCOUNT_LOCKED") {
        setError("Compte temporairement verrouillé après trop d’essais. Réessaie dans 15 minutes.");
      } else if (code === "RATE_LIMITED") {
        setError("Trop de tentatives. Attends quelques minutes puis réessaie.");
      } else if (code === "INVALID_CREDENTIALS") {
        setError("Email ou mot de passe incorrect.");
      } else {
        setError(code ?? "Erreur de connexion");
      }
    }
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotBusy(true);
    setForgotError(null);
    setForgotMsg(null);
    try {
      await api.forgotPassword(forgotEmail.trim());
      setForgotMsg("Si un compte existe pour cet e-mail, un lien de réinitialisation vient d’être envoyé. Vérifie ta boîte de réception.");
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "error" in err ? String((err as { error: unknown }).error) : "";
      if (code === "MAIL_DISABLED") setForgotError("L’envoi d’e-mails n’est pas configuré pour le moment.");
      else if (code === "MAIL_SEND_FAILED")
        setForgotError("L’e-mail n’a pas pu être envoyé (SMTP). Vérifie les variables MAIL_* sur le serveur et le dossier spam.");
      else if (code === "RATE_LIMITED") setForgotError("Trop de tentatives. Attends quelques minutes puis réessaie.");
      else setForgotError("La demande n’a pas pu être envoyée. Réessaie plus tard.");
    } finally {
      setForgotBusy(false);
    }
  };

  return (
    <div className="sdg-container py-12">
      <h1 className="sdg-title">Connexion</h1>
      <p className="sdg-subtitle mt-2">Accède à ton espace (client) ou à l’administration.</p>

      <div className="sdg-card mx-auto mt-6 max-w-md p-5">
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div>
            <label className="sdg-label">Email</label>
            <input
              className="sdg-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              autoComplete="username"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <label className="sdg-label mb-0">Mot de passe</label>
              <button
                type="button"
                className="text-sm font-semibold text-water-800 underline-offset-2 hover:underline"
                onClick={() => {
                  setForgotOpen(true);
                  setForgotEmail(email.trim() || forgotEmail);
                  setForgotMsg(null);
                  setForgotError(null);
                }}
              >
                Mot de passe oublié
              </button>
            </div>
            <input
              className="sdg-input mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              autoComplete="current-password"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3 select-none">
            <input
              type="checkbox"
              className="h-4 w-4 accent-water-600"
              checked={remember}
              onChange={(e) => {
                const on = e.target.checked;
                setRemember(on);
                if (!on) clearRemembered();
              }}
            />
            <span className="text-sm font-semibold text-slate-800">Se souvenir de moi</span>
          </label>

          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>}

          <button className="sdg-btn-primary w-full" type="submit">
            Se connecter
          </button>
        </form>
      </div>

      {forgotOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 sm:items-center"
          role="presentation"
          onClick={() => setForgotOpen(false)}
        >
          <div
            className="sdg-card w-full max-w-md p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="forgot-title" className="text-lg font-extrabold text-slate-900">
              Mot de passe oublié
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Indique ton e-mail : tu recevras un lien pour choisir un nouveau mot de passe (valable 2 heures).
            </p>
            <form onSubmit={(e) => void submitForgot(e)} className="mt-4 space-y-4">
              <div>
                <label className="sdg-label">Email</label>
                <input
                  className="sdg-input"
                  type="email"
                  required
                  autoComplete="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                />
              </div>
              {forgotMsg ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{forgotMsg}</div>
              ) : null}
              {forgotError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{forgotError}</div>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" className="sdg-btn-soft" onClick={() => setForgotOpen(false)}>
                  Fermer
                </button>
                <button type="submit" className="sdg-btn-primary" disabled={forgotBusy}>
                  {forgotBusy ? "Envoi…" : "Envoyer le lien"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
