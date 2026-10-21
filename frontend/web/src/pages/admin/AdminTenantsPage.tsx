import React from "react";
import { api, type DirectoryPayload, type DirectoryTenant } from "../../lib/api";
import { DateField, ymdToJjmmaaaa } from "../../lib/dateField";

function messageOf(error: unknown) {
  const code = error && typeof error === "object" && "error" in error ? String((error as { error: unknown }).error) : "Erreur";
  if (code === "NOT_MONTHLY_RENTAL") return "Le logement choisi n’est pas une location au mois.";
  if (code === "USER_ALREADY_LINKED") return "Ce compte est déjà lié à une autre fiche.";
  if (code === "VALIDATION_ERROR") return "Vérifie les champs, notamment l’e-mail et les dates.";
  return code === "Erreur" ? "Erreur" : String(code);
}

function tenantBlob(tenant: DirectoryTenant) {
  return [
    tenant.lastName,
    tenant.firstName,
    tenant.establishmentName,
    tenant.email,
    tenant.phone,
    tenant.formerAddress,
    tenant.nationality,
    tenant.visaNumber
  ]
    .join(" ")
    .toLowerCase();
}

export function AdminTenantsPage() {
  const [data, setData] = React.useState<DirectoryPayload | null>(null);
  const [query, setQuery] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<DirectoryTenant | null>(null);

  const reload = React.useCallback(async () => {
    setError(null);
    setData(await api.adminDirectory());
  }, []);

  React.useEffect(() => {
    void reload().catch((e: unknown) => setError(messageOf(e)));
  }, [reload]);

  const needle = query.trim().toLowerCase();
  const tenants = (data?.tenants ?? []).filter((tenant) => !needle || tenantBlob(tenant).includes(needle));

  return (
    <div className="sdg-container py-10">
      <h1 className="sdg-title">Locataires</h1>
      <p className="sdg-subtitle mt-2">Tous les locataires enregistrés, quel que soit le logement.</p>
      <input
        className="sdg-input mt-6"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher par nom, logement, e-mail, téléphone…"
        aria-label="Rechercher un locataire"
      />
      {notice ? <p className="mt-3 text-sm font-semibold text-emerald-800">{notice}</p> : null}
      {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
      <div className="sdg-card mt-4 overflow-x-auto p-0">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Prénom</th>
              <th className="px-4 py-3">Logement</th>
              <th className="px-4 py-3">Téléphone</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Entrée</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-4 py-3 font-semibold text-slate-900">{tenant.lastName || "—"}</td>
                <td className="px-4 py-3 text-slate-800">{tenant.firstName || "—"}</td>
                <td className="px-4 py-3 text-slate-800">{tenant.establishmentName}</td>
                <td className="px-4 py-3 text-slate-700">{tenant.phone || "—"}</td>
                <td className="px-4 py-3 text-slate-700">{tenant.email || "—"}</td>
                <td className="px-4 py-3 text-slate-700">{tenant.leaseStart ? ymdToJjmmaaaa(tenant.leaseStart) : "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" className="sdg-btn-soft !px-3 !py-1.5 text-xs" onClick={() => setEditing(tenant)}>
                    Modifier
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && tenants.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-600">{needle ? "Aucun locataire ne correspond." : "Aucun locataire en base."}</p>
        ) : null}
        {!data && !error ? <p className="px-4 py-6 text-sm font-semibold text-slate-700">Chargement…</p> : null}
      </div>
      {editing && data ? (
        <TenantEditModal
          tenant={editing}
          establishments={data.establishments}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setData(next);
            setEditing(null);
            setNotice("Locataire enregistré.");
            setError(null);
          }}
        />
      ) : null}
    </div>
  );
}

function TenantEditModal({
  tenant,
  establishments,
  onClose,
  onSaved
}: {
  tenant: DirectoryTenant;
  establishments: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: (next: DirectoryPayload) => void;
}) {
  const [form, setForm] = React.useState(tenant);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

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
        userId: tenant.user?.id ?? "",
        account: null
      });
      onSaved(next);
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sdg-tenant-edit-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="sdg-card max-h-[90dvh] w-full max-w-2xl overflow-y-auto p-4 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div id="sdg-tenant-edit-title" className="text-base font-extrabold tracking-tight text-slate-900">
            Modifier le locataire
          </div>
          <button type="button" className="sdg-btn-soft" disabled={busy} onClick={onClose}>
            Fermer
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">
            Nom
            <input className="sdg-input mt-1" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Prénom
            <input className="sdg-input mt-1" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Téléphone
            <input className="sdg-input mt-1" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            E-mail
            <input className="sdg-input mt-1" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">
            Ancienne adresse
            <input className="sdg-input mt-1" value={form.formerAddress} onChange={(e) => setForm({ ...form, formerAddress: e.target.value })} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Nationalité
            <input className="sdg-input mt-1" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Numéro de visa
            <input className="sdg-input mt-1" value={form.visaNumber} onChange={(e) => setForm({ ...form, visaNumber: e.target.value })} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Date de naissance
            <DateField className="sdg-input mt-1" value={form.birthDate} onChange={(ymd) => setForm({ ...form, birthDate: ymd })} />
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
        {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
        <div className="mt-4 flex justify-end">
          <button type="button" className="sdg-btn-primary disabled:opacity-50" disabled={busy} onClick={() => void save()}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
