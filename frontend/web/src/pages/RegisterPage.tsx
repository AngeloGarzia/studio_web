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
      await refresh();
      nav("/");
    } catch (err: any) {
      const code = err?.error;
      if (code === "EMAIL_TAKEN") {
        setError(
          "Cette adresse e-mail est déjà utilisée par un autre compte. Connecte-toi, ou utilise la même adresse que pour ta demande sur cet appareil (navigateur) pour finaliser ton compte invité."
        );
      } else {
        setError(code ?? "Erreur");
      }
    }
  };

  return (
    <div className="sdg-container py-12">
      <h1 className="sdg-title">Inscription</h1>
      <p className="sdg-subtitle mt-2">
        Crée un compte pour suivre tes messages et tes réservations. Si tu as déjà envoyé une demande sans compte sur cet appareil, utilise la{" "}
        <strong>même adresse e-mail</strong> : ton compte sera complété au lieu d’être refusé.
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
            <input className="sdg-input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={8} />
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

