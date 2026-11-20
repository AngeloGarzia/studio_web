import React from "react";
import "./RingCarousel.css";

export type RingCarouselItem = {
  id: string;
  /** Présent uniquement pour un vrai logement. */
  establishmentId?: string;
  name: string;
  src?: string;
  kind?: "lodging" | "promo";
};

type Props = {
  items: RingCarouselItem[];
  choosingId: string | null;
  onSelect: (establishmentId: string) => void;
  /** Clic sur une carte « Votre Studio ici ». */
  onPromoSelect?: () => void;
};

const DEG_PER_PX = 0.35;
const AUTO_DEG_PER_MS = 0.012;
const DRAG_THRESHOLD_PX = 8;
/** Nombre mini de faces pour une couronne lisible (logements + pubs). */
export const RING_MIN_SLOTS = 6;

function frontIndex(rotationDeg: number, count: number): number {
  if (count <= 0) return 0;
  const step = 360 / count;
  // Face vers la caméra quand rotation + i*step ≈ 0 (mod 360).
  const raw = Math.round(-rotationDeg / step);
  return ((raw % count) + count) % count;
}

function activateItem(
  item: RingCarouselItem,
  onSelect: (establishmentId: string) => void,
  onPromoSelect?: () => void
) {
  const isPromo = item.kind === "promo" || !item.establishmentId;
  if (isPromo) {
    onPromoSelect?.();
    return;
  }
  onSelect(item.establishmentId!);
}

export function RingCarousel({ items, choosingId, onSelect, onPromoSelect }: Props) {
  const slides = React.useMemo(() => {
    // Ordre d’entrée = ordre de création (fourni par l’API / le catalogue).
    const real = items.filter((it) => it.kind !== "promo" && (it.src || it.establishmentId));
    if (real.length >= RING_MIN_SLOTS) return real;
    const slidesOut = [...real];
    let i = 0;
    while (slidesOut.length < RING_MIN_SLOTS) {
      slidesOut.push({
        id: `promo-auto-${i}`,
        name: "Votre Studio ici",
        kind: "promo"
      });
      i += 1;
    }
    return slidesOut;
  }, [items]);

  const n = slides.length;
  const [rotation, setRotation] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [reduceMotion, setReduceMotion] = React.useState(false);
  const dragging = React.useRef(false);
  const dragMoved = React.useRef(false);
  const startX = React.useRef(0);
  const lastX = React.useRef(0);
  const activePointer = React.useRef<number | null>(null);
  const rotationRef = React.useRef(rotation);
  rotationRef.current = rotation;

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

  if (n < 2) return null;

  const step = 360 / n;
  const facing = frontIndex(rotation, n);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragging.current = true;
    dragMoved.current = false;
    activePointer.current = e.pointerId;
    startX.current = e.clientX;
    lastX.current = e.clientX;
    setPaused(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || activePointer.current !== e.pointerId) return;
    const total = Math.abs(e.clientX - startX.current);
    if (total > DRAG_THRESHOLD_PX) {
      if (!dragMoved.current) {
        dragMoved.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    }
    if (!dragMoved.current) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    setRotation((r) => r + dx * DEG_PER_PX);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || activePointer.current !== e.pointerId) return;
    const wasDrag = dragMoved.current;
    dragging.current = false;
    activePointer.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
    if (!wasDrag) {
      const item = slides[frontIndex(rotationRef.current, n)];
      if (item) activateItem(item, onSelect, onPromoSelect);
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
          {slides.map((item, i) => {
            const isPromo = item.kind === "promo" || !item.establishmentId;
            const isFront = i === facing;
            return (
              <button
                key={item.id}
                type="button"
                tabIndex={isFront ? 0 : -1}
                className={`sdg-ring__card${isPromo ? " sdg-ring__card--promo" : ""}${isFront ? " sdg-ring__card--front" : ""}`}
                style={{ transform: `rotateY(${i * step}deg) translateZ(var(--sdg-ring-radius))` }}
                disabled={!isPromo && choosingId === item.establishmentId}
                aria-label={isPromo ? "Créer un logement : Votre Studio ici" : `Ouvrir ${item.name}`}
                aria-current={isFront ? "true" : undefined}
                onClick={(e) => {
                  // Le stage gère déjà le clic (face avant) ; évite le double déclenchement.
                  e.preventDefault();
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight") {
                    e.preventDefault();
                    setRotation((r) => r - step);
                  } else if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    setRotation((r) => r + step);
                  } else if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    activateItem(item, onSelect, onPromoSelect);
                  }
                }}
              >
                {isPromo ? (
                  <span className="sdg-ring__promo">
                    <span className="sdg-ring__promo-kicker">Emplacement libre</span>
                    <span className="sdg-ring__promo-title">Votre Studio ici</span>
                    <span className="sdg-ring__promo-sub">Proposez votre logement</span>
                  </span>
                ) : (
                  <>
                    {item.src ? (
                      <img src={item.src} alt={`Couverture de ${item.name}`} className="sdg-ring__img" draggable={false} />
                    ) : (
                      <span className="sdg-ring__fallback" aria-hidden />
                    )}
                    <span className="sdg-ring__label">{item.name}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <p className="sdg-ring__hint">Glisse pour tourner · clique pour ouvrir la face devant</p>
    </div>
  );
}
