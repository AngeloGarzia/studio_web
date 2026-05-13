import React from "react";
import { api } from "../lib/api";

export function ClientBookingsPage() {
  const [items, setItems] = React.useState<any[]>([]);

  React.useEffect(() => {
    void (async () => {
      const data = (await api.myBookings()) as any[];
      setItems(data);
    })();
  }, []);

  return (
    <div className="sdg-container py-10">
      <h1 className="sdg-title">Mes réservations</h1>
      <p className="sdg-subtitle mt-2">Historique de tes demandes et statuts.</p>

      <div className="sdg-card mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200/70 bg-white/40">
              <tr>
                <th className="px-4 py-3 font-extrabold text-slate-800">Dates</th>
                <th className="px-4 py-3 font-extrabold text-slate-800">Statut</th>
                <th className="px-4 py-3 font-extrabold text-slate-800">Message</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => {
                const badge =
                  b.status === "CONFIRMED"
                    ? "bg-rose-600 text-white"
                    : b.status === "PENDING"
                      ? "bg-sun-200 text-slate-900"
                      : "bg-slate-200 text-slate-800";
                return (
                  <tr key={b.id} className="border-b border-slate-200/60 last:border-b-0">
                    <td className="px-4 py-3">
                      {new Date(b.startDate).toLocaleDateString("fr-FR")} → {new Date(b.endDate).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold ${badge}`}>{b.status}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{b.notes ?? ""}</td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-sm text-slate-600">
                    Aucune demande pour le moment.
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

