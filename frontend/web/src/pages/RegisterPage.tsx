import React from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export function RegisterPage() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [profileName, setProfileName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.register({ email, password, profileName: profileName || undefined, phone: phone || undefined });
      setPassword("");
      await refresh();
      nav("/");
    } catch (err: any) {
      setPassword("");
      const code = err?.error;
      if (code === "EMAIL_TAKEN") {
        setError(
          "Cette adresse e-mail est déjà utilisée. Connecte-toi, ou finalise un compte invité depuis le même navigateur avec la même adresse."
        );
      } else if (code === "RATE_LIMITED") {
        setError("Trop de tentatives. Attends quelques minutes puis réessaie.");
      } else if (code === "VALIDATION_ERROR" && Array.isArray(err?.issues)) {
        const msg = String(err.issues[0]?.message ?? "");
        if (msg.includes("PASSWORD_TOO_SHORT") || msg.includes("Too small")) {
          setError("Mot de passe : 10 caractères minimum.");
        } else if (msg.includes("PASSWORD_NEED")) {
          setError("Mot de passe : au moins une lettre et un chiffre.");
        } else {
          setError("Données invalides. Vérifie le formulaire.");
        }
      } else {
        setError(code ?? "Erreur");
      }
    }
  };

  return (
    <div className="sdg-container py-12">
      <h1 className="sdg-title">Inscription</h1>
      <p className="sdg-subtitle mt-2">
        Crée un compte pour suivre tes messages et tes réservations. Après une demande sans compte, finalise-la depuis le{" "}
        <strong>même navigateur</strong> avec la <strong>même adresse e-mail</strong> (cookie invité + compte guest).
      </p>

      <div className="sdg-card mx-auto mt-6 max-w-md p-5">
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div>
            <label className="sdg-label">Nom (optionnel)</label>
            <input className="sdg-input" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
          </div>

          <div>
            <label className="sdg-label">Téléphone (optionnel)</label>
            <input className="sdg-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div>
            <label className="sdg-label">Email</label>
            <input className="sdg-input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </div>

          <div>
            <label className="sdg-label">Mot de passe</label>
            <input
              className="sdg-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
            />
            <p className="mt-1 text-xs font-semibold text-slate-500">Au moins 10 caractères, une lettre et un chiffre.</p>
          </div>

          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>}

          <button className="sdg-btn-primary w-full" type="submit">
            Créer mon compte
          </button>
        </form>
      </div>
    </div>
  );
}

