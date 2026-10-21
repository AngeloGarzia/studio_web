import React from "react";
import { api, type DirectoryAccount, type DirectoryOwner, type DirectoryPayload, type DirectoryTenant } from "../../lib/api";
import { DateField } from "../../lib/dateField";
import type { AppRole } from "../../lib/roles";

function roleMark(role: AppRole) {
  if (role === "ADMIN") return " — admin";
  if (role === "OWNER") return " — propriétaire";
  return "";
}

function RoleOptions() {
  return (
    <>
      <option value="CLIENT">Client</option>
      <option value="OWNER">Propriétaire</option>
      <option value="ADMIN">Administrateur</option>
    </>
  );
}

function messageOf(error: unknown) {
  const code = error && typeof error === "object" && "error" in error ? String((error as { error: unknown }).error) : "Erreur";
  const issues =
    error && typeof error === "object" && "issues" in error && Array.isArray((error as { issues: unknown }).issues)
      ? (error as { issues: Array<{ path?: unknown }> }).issues
      : [];
  if (code === "VALIDATION_ERROR" && issues.some((issue) => Array.isArray(issue.path) && issue.path.includes("email"))) {
    return "L’e-mail n’est pas valide.";
  }
  if (code === "VALIDATION_ERROR" && issues.some((issue) => Array.isArray(issue.path) && issue.path.includes("password"))) {
    return "Le mot de passe doit faire au moins 10 caractères, avec une lettre et un chiffre.";
  }
  if (code === "EMAIL_TAKEN") return "Cet e-mail de compte est déjà utilisé.";
  if (code === "USER_ALREADY_LINKED") return "Ce compte est déjà lié à une autre fiche du même type.";
  if (code === "LAST_ADMIN") return "Il doit rester au moins un administrateur.";
  if (code === "ACCOUNT_EXISTS") return "Cette fiche a déjà un compte.";
  if (code === "NO_ACCOUNT") return "Crée d’abord un compte pour envoyer la confirmation.";
  if (code === "MAIL_DISABLED") return "L’envoi d’e-mails n’est pas configuré.";
  if (code === "MAIL_SEND_FAILED") return "L’e-mail n’a pas pu être envoyé.";
  if (code === "NOT_MONTHLY_RENTAL") return "Un locataire se rattache à un logement loué au mois.";
  if (code === "COMPANY_NAME_REQUIRED") return "Indique le nom de la SCI ou de la société.";
  if (code === "QUITTANCE_LINKED") return "Cette personne figure sur une quittance déjà envoyée.";
  if (code === "INVALID_SIGNATURE") return "La signature n’a pas pu être enregistrée. Dessine-la de nouveau.";
  if (code === "VALIDATION_ERROR") return "Certaines informations ne sont pas valides.";
  return code;
}

function optionalPasswordError(password: string) {
  const value = password.trim();
  if (!value) return null;
  if (value.length < 10 || !/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    return "Le mot de passe doit faire au moins 10 caractères, avec une lettre et un chiffre. Laissez le champ vide pour un mot de passe temporaire.";
  }
  return null;
}

function mailFeedback(next: DirectoryPayload): { notice: string | null; error: string | null } {
  if (!next.mail) return { notice: null, error: null };
  if (next.mail.ok) {
    return {
      notice: `E-mail envoyé à ${next.mail.to} : mot de passe temporaire, et lien pour le changer tout de suite.`,
      error: null
    };
  }
  return {
    notice: null,
    error:
      next.mail.error === "MAIL_DISABLED"
        ? "Le compte est créé, mais l’envoi d’e-mails n’est pas configuré."
        : "Le compte est créé, mais l’e-mail n’a pas pu être envoyé."
  };
}

function todayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function accountOf(userId: string, users: DirectoryAccount[]) {
  const user = users.find((item) => item.id === userId);
  if (!user) return null;
  return { email: user.email, profileName: user.profileName, phone: user.phone, role: user.role, password: "" };
}

function AccountFields({
  userId,
  users,
  account,
  onUserId,
  onAccount
}: {
  userId: string;
  users: DirectoryAccount[];
  account: { email: string; profileName: string; phone: string; role: AppRole; password: string } | null;
  onUserId: (userId: string) => void;
  onAccount: (account: NonNullable<typeof account>) => void;
}) {
  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      <p className="text-sm font-bold text-slate-800">Compte de l’application</p>
      <label className="mt-2 block text-sm font-semibold text-slate-700">
        Compte lié
        <select
          className="sdg-input mt-1"
          value={userId}
          onChange={(event) => onUserId(event.target.value)}
        >
          <option value="">Aucun</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.email}
              {user.isGuest ? " (invité)" : ""}
              {roleMark(user.role)}
            </option>
          ))}
        </select>
      </label>
      {account ? (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">
            E-mail du compte
            <input className="sdg-input mt-1" type="email" value={account.email} onChange={(e) => onAccount({ ...account, email: e.target.value })} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Nom affiché
            <input className="sdg-input mt-1" value={account.profileName} onChange={(e) => onAccount({ ...account, profileName: e.target.value })} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Téléphone du compte
            <input className="sdg-input mt-1" value={account.phone} onChange={(e) => onAccount({ ...account, phone: e.target.value })} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Rôle
            <select className="sdg-input mt-1" value={account.role} onChange={(e) => onAccount({ ...account, role: e.target.value as AppRole })}>
              <RoleOptions />
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">
            Nouveau mot de passe
            <input
              className="sdg-input mt-1"
              type="password"
              value={account.password}
              autoComplete="new-password"
              placeholder="Laisser vide pour ne pas le changer"
              onChange={(e) => onAccount({ ...account, password: e.target.value })}
            />
          </label>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-600">Aucun compte lié.</p>
      )}
    </div>
  );
}

function AccountTools({
  kind,
  personId,
  hasAccount,
  defaultEmail,
  defaultName,
  onSaved
}: {
  kind: "owners" | "tenants";
  personId: string;
  hasAccount: boolean;
  defaultEmail: string;
  defaultName: string;
  onSaved: (next: DirectoryPayload) => void;
}) {
  const [email, setEmail] = React.useState(defaultEmail);
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<AppRole>(kind === "owners" ? "OWNER" : "CLIENT");
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const createAccount = async () => {
    const passwordError = optionalPasswordError(password);
    if (!email.trim() || passwordError) {
      setError(passwordError ?? "Indique l’e-mail du compte.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await api.adminCreateDirectoryAccount(kind, personId, {
        email: email.trim(),
        profileName: defaultName,
        phone: "",
        role,
        password
      });
      onSaved(next);
      setPassword("");
      const mailed = mailFeedback(next);
      if (mailed.error) setError(mailed.error);
      else setNotice(mailed.notice);
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.adminSendDirectoryConfirmation(kind, personId, password.trim());
      setPassword("");
      setNotice(`E-mail envoyé à ${result.to}, avec un lien pour choisir le mot de passe.`);
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      {hasAccount ? (
        <>
          <label className="text-sm font-semibold text-slate-700">
            Nouveau mot de passe pour l’e-mail
            <input
              className="sdg-input mt-1"
              type="password"
              value={password}
              autoComplete="new-password"
              placeholder="Facultatif : vide = le mot de passe actuel reste en place"
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="mt-1 block text-xs font-medium text-slate-500">
              Le message contient un lien pour choisir un mot de passe tout de suite. S’il est renseigné, le mot de passe ci-dessus est envoyé comme mot de passe temporaire.
            </span>
          </label>
          <button type="button" className="sdg-btn-soft mt-3" disabled={busy} onClick={() => void send()}>
            Envoyer la confirmation
          </button>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">
            E-mail du nouveau compte
            <input className="sdg-input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Mot de passe temporaire
            <input className="sdg-input mt-1" type="password" value={password} autoComplete="new-password" placeholder="Vide : généré et envoyé par e-mail" onChange={(e) => setPassword(e.target.value)} />
            <span className="mt-1 block text-xs font-medium text-slate-500">
              Un e-mail part à la création : mot de passe temporaire, et lien pour le changer tout de suite.
            </span>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Rôle
            <select className="sdg-input mt-1" value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
              <RoleOptions />
            </select>
          </label>
          <div className="flex items-end">
            <button type="button" className="sdg-btn-primary" disabled={busy} onClick={() => void createAccount()}>
              Créer le compte
            </button>
          </div>
        </div>
      )}
      {notice ? <p className="mt-2 text-sm font-semibold text-emerald-800">{notice}</p> : null}
      {error ? <p className="mt-2 text-sm font-semibold text-rose-700">{error}</p> : null}
    </div>
  );
}

function signatureUrl(ownerId: string, version: number) {
  return `/api/admin/directory/owners/${ownerId}/signature?v=${version}`;
}

function SignatureEditor({ ownerId, hasSignature, isCompany }: { ownerId: string; hasSignature: boolean; isCompany: boolean }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const drawing = React.useRef(false);
  const lastPoint = React.useRef<{ x: number; y: number } | null>(null);
  const [signed, setSigned] = React.useState(hasSignature);
  const [version, setVersion] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSigned(hasSignature);
  }, [hasSignature, ownerId]);

  const prepareCanvas = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = 640 * ratio;
    canvas.height = 200 * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    return ctx;
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const ctx = prepareCanvas();
    if (!ctx || !signed) return;
    const image = new Image();
    image.onload = () => ctx.drawImage(image, 0, 0, 640, 200);
    image.src = signatureUrl(ownerId, version);
  }, [open, ownerId, prepareCanvas, signed, version]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * 640, y: ((event.clientY - rect.top) / rect.height) * 200 };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    lastPoint.current = point(event);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !lastPoint.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const cursor = point(event);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(cursor.x, cursor.y);
    ctx.stroke();
    lastPoint.current = cursor;
  };

  const stop = () => {
    drawing.current = false;
    lastPoint.current = null;
  };

  const clearCanvas = () => {
    prepareCanvas();
  };

  const save = async () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let index = 3; index < pixels.length; index += 32) {
      if (pixels[index] > 12) ink += 1;
    }
    if (ink < 6) {
      setError("Dessine la signature avant de l’enregistrer.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.adminSaveOwnerSignature(ownerId, canvas.toDataURL("image/png"));
      setSigned(true);
      setVersion((current) => current + 1);
      setOpen(false);
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.adminClearOwnerSignature(ownerId);
      setSigned(false);
      setVersion((current) => current + 1);
      setOpen(false);
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-slate-700">{isCompany ? "Signature du mandataire" : "Signature"}</p>
      {isCompany ? <p className="mt-1 text-sm text-slate-600">C’est le mandataire qui signe les quittances de la SCI ou de la société.</p> : null}
      {signed ? (
        <img src={signatureUrl(ownerId, version)} alt="Signature enregistrée" className="mt-2 h-16 max-w-xs rounded-xl border border-slate-200 bg-white object-contain" />
      ) : (
        <p className="mt-1 text-sm text-slate-600">Aucune signature enregistrée.</p>
      )}
      <button type="button" className="sdg-btn-soft mt-2" onClick={() => { setError(null); setOpen(true); }}>
        {signed ? "Modifier la signature" : "Dessiner la signature"}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center" role="presentation" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="signature-title" className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 id="signature-title" className="text-lg font-bold text-slate-900">
              {isCompany ? "Signature du mandataire" : "Signature du propriétaire"}
            </h3>
            <p className="mt-1 text-sm text-slate-600">Dessine avec la souris ou le doigt. Cette signature est apposée sur les quittances.</p>
            <canvas
              ref={canvasRef}
              className="mt-3 h-[200px] w-full touch-none rounded-xl border border-water-200 bg-white"
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={stop}
              onPointerCancel={stop}
            />
            {error ? <p className="mt-2 text-sm font-semibold text-rose-700">{error}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="sdg-btn-primary" disabled={busy} onClick={() => void save()}>
                {busy ? "Enregistrement…" : "Enregistrer la signature"}
              </button>
              <button type="button" className="sdg-btn-soft" disabled={busy} onClick={clearCanvas}>
                Effacer
              </button>
              {signed ? (
                <button type="button" className="sdg-btn-soft" disabled={busy} onClick={() => void remove()}>
                  Supprimer
                </button>
              ) : null}
              <button type="button" className="sdg-btn-soft" disabled={busy} onClick={() => setOpen(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OwnerTile({
  owner,
  users,
  onSaved
}: {
  owner: DirectoryOwner;
  users: DirectoryAccount[];
  onSaved: (next: DirectoryPayload) => void;
}) {
  const [form, setForm] = React.useState(owner);
  const [userId, setUserId] = React.useState(owner.user?.id ?? "");
  const [account, setAccount] = React.useState(accountOf(owner.user?.id ?? "", users));
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setForm(owner);
    setUserId(owner.user?.id ?? "");
    setAccount(accountOf(owner.user?.id ?? "", users));
  }, [owner, users]);

  const save = async () => {
    if (!form.lastName.trim()) {
      setError("Indique le nom.");
      return;
    }
    if (form.isCompany && !form.companyName.trim()) {
      setError("Indique le nom de la SCI ou de la société.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await api.adminUpdateDirectoryOwner(owner.id, {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        address: form.address,
        isCompany: form.isCompany,
        companyName: form.isCompany ? form.companyName : "",
        userId,
        account
      });
      onSaved(next);
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const mandataire = `${form.firstName} ${form.lastName}`.trim();
  const title = form.isCompany && form.companyName.trim() ? form.companyName.trim() : `${form.lastName || "—"} ${form.firstName}`.trim();

  return (
    <details className="sdg-card p-4">
      <summary className="cursor-pointer">
        <span className="text-xs font-bold uppercase tracking-wide text-water-800">Propriétaire</span>
        <span className="mt-1 block text-lg font-extrabold text-slate-900">{title}</span>
        {form.isCompany ? <span className="block text-sm text-slate-700">Mandataire : {mandataire || "—"}</span> : null}
        <span className="block text-sm text-slate-600">
          {owner.establishments.length === 0 ? "Aucun établissement" : owner.establishments.map((item) => item.name).join(", ")}
          {" · "}
          {userId ? "Compte lié" : "Sans compte"}
        </span>
      </summary>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isCompany}
              onChange={(e) => setForm({ ...form, isCompany: e.target.checked, companyName: e.target.checked ? form.companyName : "" })}
            />
            SCI ou société
          </span>
        </label>
        {form.isCompany ? (
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">
            Nom de la SCI ou de la société
            <input className="sdg-input mt-1" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          </label>
        ) : null}
        <label className="text-sm font-semibold text-slate-700">
          {form.isCompany ? "Nom du mandataire" : "Nom"}
          <input className="sdg-input mt-1" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          {form.isCompany ? "Prénom du mandataire" : "Prénom"}
          <input className="sdg-input mt-1" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">
          Adresse
          <input className="sdg-input mt-1" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          E-mail
          <input className="sdg-input mt-1" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Téléphone
          <input className="sdg-input mt-1" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
      </div>
      <AccountFields
        userId={userId}
        users={users}
        account={account}
        onUserId={(id) => {
          setUserId(id);
          setAccount(accountOf(id, users));
        }}
        onAccount={setAccount}
      />
      <AccountTools
        kind="owners"
        personId={owner.id}
        hasAccount={Boolean(userId)}
        defaultEmail={form.email}
        defaultName={mandataire || title}
        onSaved={onSaved}
      />
      <SignatureEditor ownerId={owner.id} hasSignature={owner.hasSignature} isCompany={form.isCompany} />
      {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
      <button type="button" className="sdg-btn-primary mt-4" disabled={busy} onClick={() => void save()}>
        Enregistrer
      </button>
    </details>
  );
}

function TenantTile({
  tenant,
  users,
  establishments,
  onSaved
}: {
  tenant: DirectoryTenant;
  users: DirectoryAccount[];
  establishments: Array<{ id: string; name: string }>;
  onSaved: (next: DirectoryPayload) => void;
}) {
  const [form, setForm] = React.useState(tenant);
  const [userId, setUserId] = React.useState(tenant.user?.id ?? "");
  const [account, setAccount] = React.useState(accountOf(tenant.user?.id ?? "", users));
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setForm(tenant);
    setUserId(tenant.user?.id ?? "");
    setAccount(accountOf(tenant.user?.id ?? "", users));
  }, [tenant, users]);

  const save = async () => {
    if (!form.lastName.trim() || !form.leaseStart) {
      setError("Le nom et la date d’entrée sont obligatoires.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await api.adminUpdateDirectoryTenant(tenant.id, {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        formerAddress: form.formerAddress,
        visaNumber: form.visaNumber,
        nationality: form.nationality,
        birthDate: form.birthDate,
        leaseStart: form.leaseStart,
        establishmentId: form.establishmentId,
        userId,
        account
      });
      onSaved(next);
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const title = `${form.lastName || "—"} ${form.firstName}`.trim();

  return (
    <details className="sdg-card p-4">
      <summary className="cursor-pointer">
        <span className="text-xs font-bold uppercase tracking-wide text-water-800">Locataire</span>
        <span className="mt-1 block text-lg font-extrabold text-slate-900">{title}</span>
        <span className="block text-sm text-slate-600">
          {tenant.establishmentName}
          {" · "}
          {userId ? "Compte lié" : "Sans compte"}
        </span>
      </summary>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">
          Nom
          <input className="sdg-input mt-1" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Prénom
          <input className="sdg-input mt-1" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Date de naissance
          <DateField className="sdg-input mt-1" value={form.birthDate} onChange={(ymd) => setForm({ ...form, birthDate: ymd })} />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Nationalité
          <input className="sdg-input mt-1" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">
          Ancienne adresse
          <input className="sdg-input mt-1" value={form.formerAddress} onChange={(e) => setForm({ ...form, formerAddress: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Téléphone
          <input className="sdg-input mt-1" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          E-mail
          <input className="sdg-input mt-1" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Numéro de visa
          <input className="sdg-input mt-1" value={form.visaNumber} onChange={(e) => setForm({ ...form, visaNumber: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Date d’entrée
          <DateField className="sdg-input mt-1" value={form.leaseStart} onChange={(ymd) => setForm({ ...form, leaseStart: ymd })} />
        </label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">
          Logement
          <select className="sdg-input mt-1" value={form.establishmentId} onChange={(e) => setForm({ ...form, establishmentId: e.target.value })}>
            {establishments.map((establishment) => (
              <option key={establishment.id} value={establishment.id}>
                {establishment.name}
              </option>
            ))}
            {establishments.some((establishment) => establishment.id === form.establishmentId) ? null : (
              <option value={form.establishmentId}>{tenant.establishmentName}</option>
            )}
          </select>
        </label>
      </div>
      <AccountFields
        userId={userId}
        users={users}
        account={account}
        onUserId={(id) => {
          setUserId(id);
          setAccount(accountOf(id, users));
        }}
        onAccount={setAccount}
      />
      <AccountTools
        kind="tenants"
        personId={tenant.id}
        hasAccount={Boolean(userId)}
        defaultEmail={form.email}
        defaultName={title}
        onSaved={onSaved}
      />
      {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
      <button type="button" className="sdg-btn-primary mt-4" disabled={busy} onClick={() => void save()}>
        Enregistrer
      </button>
    </details>
  );
}

function matches(query: string, parts: Array<string | null | undefined>) {
  if (!query) return true;
  const haystack = parts.filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query);
}

function CreatePerson({
  establishments,
  onCreated
}: {
  establishments: Array<{ id: string; name: string }>;
  onCreated: (next: DirectoryPayload) => void;
}) {
  const [kind, setKind] = React.useState<"owner" | "tenant" | null>(null);
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [isCompany, setIsCompany] = React.useState(false);
  const [companyName, setCompanyName] = React.useState("");
  const [establishmentId, setEstablishmentId] = React.useState(establishments[0]?.id ?? "");
  const [leaseStart, setLeaseStart] = React.useState(todayYmd);
  const [withAccount, setWithAccount] = React.useState(false);
  const [accountEmail, setAccountEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<AppRole>("CLIENT");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const open = (next: "owner" | "tenant") => {
    setKind(next);
    setRole(next === "owner" ? "OWNER" : "CLIENT");
    setError(null);
  };

  const submit = async () => {
    if (!kind || !lastName.trim()) {
      setError(kind === "owner" && isCompany ? "Indique le nom du mandataire." : "Indique le nom.");
      return;
    }
    if (kind === "owner" && isCompany && !companyName.trim()) {
      setError("Indique le nom de la SCI ou de la société.");
      return;
    }
    if (kind === "tenant" && (!establishmentId || !leaseStart)) {
      setError("Choisis le logement et la date d’entrée.");
      return;
    }
    const account = withAccount
      ? {
          email: (accountEmail || email).trim(),
          profileName: `${firstName} ${lastName}`.trim(),
          phone: phone.trim(),
          role,
          password
        }
      : null;
    const passwordError = account ? optionalPasswordError(account.password) : null;
    if (account && (!account.email || passwordError)) {
      setError(passwordError ?? "Le compte demande un e-mail.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next =
        kind === "owner"
          ? await api.adminCreateDirectoryOwner({
              firstName,
              lastName,
              email,
              phone,
              address,
              isCompany,
              companyName: isCompany ? companyName : "",
              account
            })
          : await api.adminCreateDirectoryTenant({ firstName, lastName, email, phone, establishmentId, leaseStart, account });
      setKind(null);
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setAddress("");
      setIsCompany(false);
      setCompanyName("");
      setWithAccount(false);
      setPassword("");
      onCreated(next);
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="sdg-btn-primary" onClick={() => open("owner")}>
          Nouveau propriétaire
        </button>
        <button type="button" className="sdg-btn-primary" onClick={() => open("tenant")}>
          Nouveau locataire
        </button>
      </div>
      {kind ? (
        <div className="sdg-card mt-3 p-4">
          <h2 className="text-lg font-extrabold text-slate-900">{kind === "owner" ? "Nouveau propriétaire" : "Nouveau locataire"}</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {kind === "owner" ? (
                <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isCompany}
                      onChange={(e) => {
                        setIsCompany(e.target.checked);
                        if (!e.target.checked) setCompanyName("");
                      }}
                    />
                    SCI ou société
                  </span>
                </label>
              ) : null}
              {kind === "owner" && isCompany ? (
                <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                  Nom de la SCI ou de la société
                  <input className="sdg-input mt-1" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </label>
              ) : null}
              <label className="text-sm font-semibold text-slate-700">
                {kind === "owner" && isCompany ? "Nom du mandataire" : "Nom"}
                <input className="sdg-input mt-1" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                {kind === "owner" && isCompany ? "Prénom du mandataire" : "Prénom"}
                <input className="sdg-input mt-1" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </label>
              {kind === "owner" ? (
                <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                  Adresse
                  <input className="sdg-input mt-1" value={address} onChange={(e) => setAddress(e.target.value)} />
                </label>
              ) : null}
            <label className="text-sm font-semibold text-slate-700">
              E-mail
              <input className="sdg-input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Téléphone
              <input className="sdg-input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            {kind === "tenant" ? (
              <>
                <label className="text-sm font-semibold text-slate-700">
                  Logement au mois
                  <select className="sdg-input mt-1" value={establishmentId} onChange={(e) => setEstablishmentId(e.target.value)}>
                    {establishments.map((establishment) => (
                      <option key={establishment.id} value={establishment.id}>
                        {establishment.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Date d’entrée
                  <DateField className="sdg-input mt-1" value={leaseStart} onChange={setLeaseStart} />
                </label>
              </>
            ) : null}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <input type="checkbox" checked={withAccount} onChange={(e) => setWithAccount(e.target.checked)} />
            Créer aussi un compte de l’application
          </label>
          {withAccount ? (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                E-mail du compte
                <input className="sdg-input mt-1" type="email" value={accountEmail} placeholder={email || "Même e-mail que la fiche"} onChange={(e) => setAccountEmail(e.target.value)} />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Mot de passe temporaire
                <input className="sdg-input mt-1" type="password" value={password} autoComplete="new-password" placeholder="Vide : généré et envoyé par e-mail" onChange={(e) => setPassword(e.target.value)} />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Rôle
                <select className="sdg-input mt-1" value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
                  <RoleOptions />
                </select>
              </label>
            </div>
          ) : null}
          {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="sdg-btn-primary" disabled={busy} onClick={() => void submit()}>
              Créer
            </button>
            <button type="button" className="sdg-btn-soft" disabled={busy} onClick={() => setKind(null)}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AdminUsersPage() {
  const [data, setData] = React.useState<DirectoryPayload | null>(null);
  const [query, setQuery] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setError(null);
    setData(await api.adminDirectory());
  }, []);

  React.useEffect(() => {
    void reload().catch((e: unknown) => setError(messageOf(e)));
  }, [reload]);

  const needle = query.trim().toLowerCase();
  const owners = (data?.owners ?? []).filter((owner) =>
    matches(needle, [
      owner.firstName,
      owner.lastName,
      owner.companyName,
      owner.address,
      owner.email,
      owner.phone,
      owner.user?.email,
      owner.user?.profileName,
      ...owner.establishments.map((item) => item.name)
    ])
  );
  const tenants = (data?.tenants ?? []).filter((tenant) =>
    matches(needle, [
      tenant.firstName,
      tenant.lastName,
      tenant.email,
      tenant.phone,
      tenant.formerAddress,
      tenant.visaNumber,
      tenant.nationality,
      tenant.establishmentName,
      tenant.user?.email,
      tenant.user?.profileName
    ])
  );

  return (
    <div className="sdg-container py-10">
      <h1 className="sdg-title">Utilisateurs</h1>
      <p className="sdg-subtitle mt-2">Propriétaires et locataires, avec leur compte de l’application lorsqu’il existe.</p>
      <CreatePerson
        establishments={data?.establishments ?? []}
        onCreated={(next) => {
          setData(next);
          const mailed = mailFeedback(next);
          setNotice(mailed.notice);
          setError(mailed.error);
        }}
      />
      <input
        className="sdg-input mt-6"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un locataire ou un propriétaire"
        aria-label="Rechercher un locataire ou un propriétaire"
      />
      {notice ? <p className="mt-3 text-sm font-semibold text-emerald-800">{notice}</p> : null}
      {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
      <div className="mt-4 grid grid-cols-1 gap-3">
        {owners.map((owner) => (
          <OwnerTile key={owner.id} owner={owner} users={data?.users ?? []} onSaved={setData} />
        ))}
        {tenants.map((tenant) => (
          <TenantTile
            key={tenant.id}
            tenant={tenant}
            users={data?.users ?? []}
            establishments={data?.establishments ?? []}
            onSaved={setData}
          />
        ))}
        {data && owners.length === 0 && tenants.length === 0 ? (
          <p className="text-sm text-slate-600">Aucun résultat.</p>
        ) : null}
      </div>
    </div>
  );
}
