import React from "react";
import { api } from "../../lib/api";

export function AdminAccessLogsPage() {
  const [items, setItems] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setError(null);
    try {
      const data = (await api.adminAccessLogs(200)) as any[];
      setItems(data);
    } catch (e: any) {
      setError(e?.error ?? "Erreur");
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="sdg-container py-10">
      <h1 className="sdg-title">Admin — Logs d’accès</h1>
      <p className="sdg-subtitle mt-2">IP / date / route / user-agent (200 derniers).</p>

      <div className="sdg-card mt-6 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 bg-white/40 px-4 py-3">
          <div className="text-sm font-extrabold tracking-tight text-slate-900">Derniers accès</div>
          <button className="sdg-btn-soft" onClick={() => void reload()}>
            Rafraîchir
          </button>
        </div>

        <div className="p-4">
          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200/70 bg-white/30">
              <tr>
                <th className="px-4 py-3 font-extrabold text-slate-800">Date</th>
                <th className="px-4 py-3 font-extrabold text-slate-800">IP</th>
                <th className="px-4 py-3 font-extrabold text-slate-800">Route</th>
                <th className="px-4 py-3 font-extrabold text-slate-800">Méthode</th>
                <th className="px-4 py-3 font-extrabold text-slate-800">User</th>
                <th className="px-4 py-3 font-extrabold text-slate-800">User-Agent</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id} className="border-b border-slate-200/60 last:border-b-0">
                  <td className="px-4 py-3">{new Date(l.createdAt).toLocaleString("fr-FR")}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{l.ip ?? ""}</td>
                  <td className="px-4 py-3">
                    <div className="max-w-[340px] truncate">{l.path}</div>
                  </td>
                  <td className="px-4 py-3">{l.method}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {l.userRole ? `${l.userRole}${l.userId ? ` (${String(l.userId).slice(0, 8)}…)` : ""}` : "ANON"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[360px] truncate text-xs font-semibold text-slate-600">{l.userAgent ?? ""}</div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-600">
                    Aucun log.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

