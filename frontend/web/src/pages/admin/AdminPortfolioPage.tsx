import React from "react";
import { api } from "../../lib/api";

export function AdminPortfolioPage() {
  const [items, setItems] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState<"image" | "video">("image");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);

  const reload = React.useCallback(async () => {
    const m = (await api.adminPortfolio()) as any[];
    setItems(m);
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const upload = async () => {
    setError(null);
    if (!file) {
      setError("Choisis un fichier.");
      return;
    }
    try {
      setBusy(true);
      const { uploadUrl, media } = await api.adminUploadPortfolio({
        title: title || undefined,
        type,
        filename: file.name,
        contentType: file.type || (type === "video" ? "video/mp4" : "image/jpeg")
      });

      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream"
        },
        body: file
      });
      if (!put.ok) throw new Error("UPLOAD_FAILED");

      if (type === "image") {
        await api.adminGenerateThumbnail(media.id).catch(() => {});
      }

      setTitle("");
      setFile(null);
      await reload();
    } catch (e: any) {
      setError(e?.error ?? e?.message ?? "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async (it: any) => {
    await api.adminUpdateMedia(it.id, { isPublished: !it.isPublished });
    await reload();
  };

  const remove = async (id: string) => {
    await api.adminDeleteMedia(id);
    await reload();
  };

  return (
    <div className="sdg-container py-10">
      <h1 className="sdg-title">Admin — Médias portfolio</h1>
      <p className="sdg-subtitle mt-2">Upload direct vers MinIO (S3), affichage via le backend.</p>

      <div className="sdg-card mt-6 p-4 md:p-5">
        <div className="text-sm font-extrabold tracking-tight text-slate-900">Ajouter un média</div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-5">
            <label className="sdg-label">Titre</label>
            <input className="sdg-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <label className="sdg-label">Type</label>
            <select className="sdg-input" value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="image">Image</option>
              <option value="video">Vidéo</option>
            </select>
          </div>
          <div className="md:col-span-4">
            <label className="sdg-label">Fichier</label>
            <input
              className="sdg-input p-2"
              type="file"
              accept={type === "video" ? "video/*" : "image/*"}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className="mt-1 text-xs font-semibold text-slate-500">URL signée → upload sécurisé (pas de bucket public requis).</div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button className="sdg-btn-primary" onClick={() => void upload()} disabled={busy}>
            {busy ? "Upload…" : "Uploader"}
          </button>
        </div>

        {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>}
      </div>

      <div className="sdg-card mt-6 overflow-hidden">
        <div className="border-b border-slate-200/70 bg-white/40 px-4 py-3">
          <div className="text-sm font-extrabold tracking-tight text-slate-900">Médias</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200/70 bg-white/30">
              <tr>
                <th className="px-4 py-3 font-extrabold text-slate-800">Vignette</th>
                <th className="px-4 py-3 font-extrabold text-slate-800">Titre</th>
                <th className="px-4 py-3 font-extrabold text-slate-800">Type</th>
                <th className="px-4 py-3 font-extrabold text-slate-800">Publié</th>
                <th className="px-4 py-3 font-extrabold text-slate-800">URL</th>
                <th className="px-4 py-3 font-extrabold text-slate-800"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-slate-200/60 last:border-b-0">
                  <td className="px-4 py-3">
                    {it.type === "image" ? (
                      it.thumbUrl ? (
                        <img src={it.thumbUrl} alt="thumb" className="h-12 w-16 rounded-lg border border-white/50 bg-white object-contain" />
                      ) : (
                        <div className="h-12 w-16 rounded-lg border border-slate-200 bg-white/60 text-[11px] font-semibold text-slate-500 flex items-center justify-center">
                          —
                        </div>
                      )
                    ) : (
                      <div className="h-12 w-16 rounded-lg border border-slate-200 bg-white/60 text-[11px] font-semibold text-slate-500 flex items-center justify-center">
                        VIDEO
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">{it.title ?? ""}</td>
                  <td className="px-4 py-3">{it.type}</td>
                  <td className="px-4 py-3">
                    <button
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold transition ${
                        it.isPublished ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-slate-200 text-slate-900 hover:bg-slate-300"
                      }`}
                      onClick={() => void togglePublish(it)}
                    >
                      {it.isPublished ? "Oui" : "Non"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[360px] truncate text-xs font-semibold text-water-800">{it.url ?? ""}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="sdg-btn-danger" onClick={() => void remove(it.id)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-600">
                    Aucun média.
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

