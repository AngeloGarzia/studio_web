import React from "react";
import "./PeekCarousel.css";

export type PeekCarouselItem = {
  id: string;
  src: string;
  alt: string;
  type?: "image" | "video" | string;
};

type Props = {
  items: PeekCarouselItem[];
  emptyLabel?: string;
};

export function PeekCarousel({ items, emptyLabel = "Aucun média publié pour le moment." }: Props) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = React.useState(0);
  const count = items.length;
  const single = count <= 1;

  const syncIndexFromScroll = React.useCallback(() => {
    const el = viewportRef.current;
    if (!el || count === 0) return;
    const slide = el.querySelector<HTMLElement>(".sdg-peek__slide");
    if (!slide) return;
    const style = getComputedStyle(el);
    const gap = Number.parseFloat(style.columnGap || style.gap || "0") || 0;
    const stride = slide.getBoundingClientRect().width + gap;
    if (stride <= 0) return;
    const next = Math.round(el.scrollLeft / stride);
    setIndex(Math.max(0, Math.min(count - 1, next)));
  }, [count]);

  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncIndexFromScroll);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    syncIndexFromScroll();
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
    };
  }, [syncIndexFromScroll, count]);

  React.useEffect(() => {
    if (index > count - 1) setIndex(Math.max(0, count - 1));
  }, [count, index]);

  const goTo = (target: number) => {
    const el = viewportRef.current;
    if (!el || single) return;
    const clamped = Math.max(0, Math.min(count - 1, target));
    const slide = el.querySelectorAll<HTMLElement>(".sdg-peek__slide")[clamped];
    if (!slide) return;
    el.scrollTo({ left: slide.offsetLeft, behavior: "smooth" });
    setIndex(clamped);
  };

  if (count === 0) {
    return <div className="py-6 text-sm text-slate-600">{emptyLabel}</div>;
  }

  return (
    <div className={`sdg-peek${single ? " sdg-peek--single" : ""}`}>
      <div
        ref={viewportRef}
        className="sdg-peek__viewport"
        role="region"
        aria-roledescription="carrousel"
        aria-label="Photos du logement"
        tabIndex={0}
        onKeyDown={(e) => {
          if (single) return;
          if (e.key === "ArrowRight") {
            e.preventDefault();
            goTo(index + 1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            goTo(index - 1);
          }
        }}
      >
        {items.map((item, i) => (
          <div
            key={item.id}
            className="sdg-peek__slide"
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} sur ${count}`}
            aria-hidden={i !== index}
          >
            {item.type === "video" ? (
              item.src ? (
                <video controls className="sdg-peek__media" title={item.alt}>
                  <source src={item.src} />
                </video>
              ) : (
                <div className="sdg-peek__fallback">Vidéo indisponible</div>
              )
            ) : item.src ? (
              <img src={item.src} alt={item.alt} className="sdg-peek__media" draggable={false} />
            ) : (
              <div className="sdg-peek__fallback">Image indisponible</div>
            )}
          </div>
        ))}
      </div>

      {!single ? (
        <div className="sdg-peek__controls">
          <button
            type="button"
            className="sdg-peek__btn"
            aria-label="Photo précédente"
            disabled={index <= 0}
            onClick={() => goTo(index - 1)}
          >
            Précédent
          </button>
          <span className="sdg-peek__counter" aria-live="polite">
            {index + 1} / {count}
          </span>
          <button
            type="button"
            className="sdg-peek__btn"
            aria-label="Photo suivante"
            disabled={index >= count - 1}
            onClick={() => goTo(index + 1)}
          >
            Suivant
          </button>
        </div>
      ) : null}
    </div>
  );
}
