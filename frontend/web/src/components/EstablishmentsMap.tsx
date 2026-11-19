import React from "react";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";

export type MapEstablishment = {
  id: string;
  name: string;
  address?: string | null;
  city?: string;
  latitude: number | null;
  longitude: number | null;
};

type Props = {
  establishments: MapEstablishment[];
  choosingId: string | null;
  actionLabel: string;
  onSelect: (id: string) => void;
};

const BALARUC: L.LatLngExpression = [43.441, 3.677];

// Vite casse les URLs par défaut des icônes Leaflet.
const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = defaultIcon;

export function EstablishmentsMap({ establishments, choosingId, actionLabel, onSelect }: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const markersRef = React.useRef<L.LayerGroup | null>(null);
  const onSelectRef = React.useRef(onSelect);
  onSelectRef.current = onSelect;

  const pins = React.useMemo(
    () =>
      establishments.filter(
        (e): e is MapEstablishment & { latitude: number; longitude: number } =>
          e.latitude != null && e.longitude != null && Number.isFinite(e.latitude) && Number.isFinite(e.longitude)
      ),
    [establishments]
  );

  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
      attributionControl: true
    }).setView(BALARUC, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      window.removeEventListener("resize", onResize);
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const map = mapRef.current;
    const group = markersRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const latLngs: L.LatLngExpression[] = [];

    for (const pin of pins) {
      const marker = L.marker([pin.latitude, pin.longitude]);
      const place = [pin.address?.trim(), pin.city?.trim()].filter(Boolean).join(", ");
      const popup = document.createElement("div");
      popup.className = "sdg-map-popup";
      popup.innerHTML = `<div class="sdg-map-popup-title"></div>${place ? `<div class="sdg-map-popup-place"></div>` : ""}<button type="button" class="sdg-map-popup-btn"></button>`;
      popup.querySelector(".sdg-map-popup-title")!.textContent = pin.name;
      const placeEl = popup.querySelector(".sdg-map-popup-place");
      if (placeEl) placeEl.textContent = place;
      const btn = popup.querySelector("button")!;
      btn.textContent = choosingId === pin.id ? "Ouverture…" : actionLabel;
      btn.disabled = choosingId === pin.id;
      btn.addEventListener("click", () => onSelectRef.current(pin.id));
      marker.bindPopup(popup, { maxWidth: 260 });
      marker.addTo(group);
      latLngs.push([pin.latitude, pin.longitude]);
    }

    if (latLngs.length === 1) {
      map.setView(latLngs[0]!, 14);
    } else if (latLngs.length > 1) {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [36, 36], maxZoom: 14 });
    } else {
      map.setView(BALARUC, 12);
    }
    requestAnimationFrame(() => map.invalidateSize());
  }, [pins, choosingId, actionLabel]);

  if (pins.length === 0) return null;

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-water-200/70 shadow-sm">
      <div ref={containerRef} className="h-[280px] w-full md:h-[360px]" role="img" aria-label="Carte des établissements" />
      <style>{`
        .sdg-map-popup { font-family: inherit; min-width: 160px; }
        .sdg-map-popup-title { font-weight: 800; font-size: 14px; color: #0f172a; }
        .sdg-map-popup-place { margin-top: 4px; font-size: 12px; color: #475569; }
        .sdg-map-popup-btn {
          margin-top: 10px; width: 100%; border: 0; border-radius: 999px;
          background: #0e7490; color: #fff; font-weight: 700; font-size: 12px;
          padding: 8px 12px; cursor: pointer;
        }
        .sdg-map-popup-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .leaflet-container { font: inherit; }
      `}</style>
    </div>
  );
}
