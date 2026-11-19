import React from "react";
import "./RingCarousel.css";

export type RingCarouselItem = {
  /** Clé unique de la slide (ex. media id). */
  id: string;
  /** Établissement ouvert au clic. */
  establishmentId: string;
  name: string;
  src: string;
};

type Props = {
  items: RingCarouselItem[];
  choosingId: string | null;
  onSelect: (establishmentId: string) => void;
};

const DEG_PER_PX = 0.35;
const AUTO_DEG_PER_MS = 0.012;

export function RingCarousel({ items, choosingId, onSelect }: Props) {
  const covers = React.useMemo(() => items.filter((it) => Boolean(it.src)), [items]);
  const n = covers.length;
  const [rotation, setRotation] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [reduceMotion, setReduceMotion] = React.useState(false);
  const dragging = React.useRef(false);
  const dragMoved = React.useRef(false);
  const lastX = React.useRef(0);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mql.matches);
    sync();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", sync);
      return () => mql.removeEventListener("change", sync);
    }
    mql.addListener(sync);
    return () => mql.removeListener(sync);
  }, []);

  React.useEffect(() => {
    if (reduceMotion || paused || n < 2) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setRotation((r) => r + dt * AUTO_DEG_PER_MS);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion, paused, n]);

  // Au moins 2 photos pour former une couronne lisible.
  if (n < 2) return null;

  const step = 360 / n;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    dragMoved.current = false;
    lastX.current = e.clientX;
    setPaused(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastX.current;
    if (Math.abs(dx) > 2) dragMoved.current = true;
    lastX.current = e.clientX;
    setRotation((r) => r + dx * DEG_PER_PX);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!reduceMotion) setPaused(false);
  };

  return (
    <div
      className="sdg-ring"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => {
        if (!dragging.current && !reduceMotion) setPaused(false);
      }}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node) && !dragging.current && !reduceMotion) {
          setPaused(false);
        }
      }}
    >
      <div
        className="sdg-ring__stage"
        role="region"
        aria-roledescription="carrousel"
        aria-label="Logements en aperçu 3D"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="sdg-ring__ring" style={{ transform: `rotateY(${rotation}deg)` }}>
          {covers.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className="sdg-ring__card"
              style={{ transform: `rotateY(${i * step}deg) translateZ(var(--sdg-ring-radius))` }}
              disabled={choosingId === item.establishmentId}
              aria-label={`Ouvrir ${item.name}`}
              onClick={() => {
                if (dragMoved.current) return;
                onSelect(item.establishmentId);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(item.establishmentId);
                } else if (e.key === "ArrowRight") {
                  e.preventDefault();
                  setRotation((r) => r - step);
                } else if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  setRotation((r) => r + step);
                }
              }}
            >
              <img src={item.src} alt={`Couverture de ${item.name}`} className="sdg-ring__img" draggable={false} />
              <span className="sdg-ring__label">{item.name}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="sdg-ring__hint">Glisse pour tourner · clique pour ouvrir</p>
    </div>
  );
}
