import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export function ChoosePasswordPage() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError("Ce lien n’est pas valide. Demandez un nouvel e-mail de création de compte.");
      return;
    }
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Le mot de passe doit faire au moins 10 caractères, avec une lettre et un chiffre.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne sont pas identiques.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.setupPassword(token, password);
      setPassword("");
      setConfirm("");
      await refresh();
      nav("/");
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "error" in err ? String((err as { error: unknown }).error) : "";
      if (code === "TOKEN_EXPIRED") setError("Ce lien a expiré. Demandez un nouvel e-mail.");
      else if (code === "TOKEN_INVALID") setError("Ce lien n’est plus valable. Demandez un nouvel e-mail.");
      else if (code === "RATE_LIMITED") setError("Trop de tentatives. Attends quelques minutes puis réessaie.");
      else setError("Le mot de passe n’a pas pu être enregistré.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sdg-container py-12">
      <h1 className="sdg-title">Choisir un mot de passe</h1>
      <p className="sdg-subtitle mt-2">Ce lien remplace le mot de passe temporaire reçu par e-mail.</p>
      <div className="sdg-card mx-auto mt-6 max-w-md p-5">
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div>
            <label className="sdg-label">Nouveau mot de passe</label>
            <input
              className="sdg-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="sdg-label">Confirmation</label>
            <input
              className="sdg-input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              type="password"
              required
              autoComplete="new-password"
            />
          </div>
          {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div> : null}
          <button className="sdg-btn-primary w-full" type="submit" disabled={busy}>
            Enregistrer et se connecter
          </button>
        </form>
      </div>
    </div>
  );
}
