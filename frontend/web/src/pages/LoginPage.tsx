import React from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.login(email, password);
      await refresh();
      nav("/");
    } catch (err: any) {
      setError(err?.error ?? "Erreur");
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
            <input className="sdg-input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </div>

          <div>
            <label className="sdg-label">Mot de passe</label>
            <input className="sdg-input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </div>

          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>}

          <button className="sdg-btn-primary w-full" type="submit">
            Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}

