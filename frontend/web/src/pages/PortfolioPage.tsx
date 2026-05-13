import React from "react";
import { api } from "../lib/api";

type Media = { id: string; title?: string | null; type: string; publicUrl?: string | null; s3Key: string };

export function PortfolioPage() {
  const [items, setItems] = React.useState<Media[]>([]);

  React.useEffect(() => {
    void (async () => {
      const m = (await api.publicPortfolio()) as any[];
      setItems(m as any);
    })();
  }, []);

  return (
    <div className="sdg-container py-10">
      <h1 className="sdg-title">Portfolio</h1>
      <p className="sdg-subtitle mt-2">Photos & vidéos du studio (ambiance soleil & eau).</p>

      <div className="sdg-card mt-6 p-4 md:p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => {
            const url = (it as any).url ?? it.publicUrl ?? "";
            return (
              <div key={it.id} className="rounded-2xl border border-white/50 bg-white/60 p-3 shadow-lg shadow-water-900/5">
                <div className="mb-2 text-sm font-extrabold tracking-tight text-slate-900">
                  {it.title ?? (it.type === "video" ? "Vidéo" : "Photo")}
                </div>
                <div className="overflow-hidden rounded-xl bg-slate-50">
                  {it.type === "video" ? (
                    url ? (
                      <video controls className="h-auto w-full">
                        <source src={url} />
                      </video>
                    ) : (
                      <div className="p-3 text-sm text-slate-600">Vidéo non configurée.</div>
                    )
                  ) : url ? (
                    <img src={url} alt={it.title ?? "media"} className="h-auto w-full" />
                  ) : (
                    <div className="p-3 text-sm text-slate-600">Image non configurée.</div>
                  )}
                </div>
              </div>
            );
          })}
          {items.length === 0 && <div className="text-sm text-slate-600">Aucun média publié pour le moment.</div>}
        </div>
      </div>
    </div>
  );
}

