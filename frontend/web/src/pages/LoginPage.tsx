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
            <label className="sdg-label">Mot de passe</label>
            <input
              className="sdg-input"
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
    </div>
  );
}
