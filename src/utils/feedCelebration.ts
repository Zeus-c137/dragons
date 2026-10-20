import corn from "@/src/assets/svg/corn.svg";

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

function cornFrame(x: number, y: number, scale: number, rotate: number, opacity: number) {
  return {
    transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale}) rotate(${rotate}deg)`,
    opacity,
  };
}

/** Pop corn out of the fed card, then carry it into the withdrawable balance. */
export function celebrateFeed(sourceRects: DOMRect[], feedAll = false): void {
  if (!sourceRects.length || typeof window === "undefined") return;
  if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const balance = document.querySelector<HTMLElement>(".user-app-withdrawable-balance");
  if (!balance) return;

  const targetRect = balance.getBoundingClientRect();
  const targetX = targetRect.left + targetRect.width / 2;
  const targetY = targetRect.top + targetRect.height / 2;
  const piecesPerCard = feedAll ? 40 : 60;

  sourceRects.slice(0, 12).forEach((sourceRect, sourceIndex) => {
    const count = piecesPerCard;
    for (let pieceIndex = 0; pieceIndex < count; pieceIndex += 1) {
      const image = document.createElement("img");
      const startX = sourceRect.left + sourceRect.width * (0.38 + Math.random() * 0.24);
      const startY = sourceRect.top + sourceRect.height * (0.58 + Math.random() * 0.2);
      const dx = targetX - startX;
      const dy = targetY - startY;
      const fan = (pieceIndex - (count - 1) / 2) * 5;
      const delay = sourceIndex * 35 + pieceIndex * (feedAll ? 45 : 30);

      image.src = corn;
      image.alt = "";
      image.setAttribute("aria-hidden", "true");
      Object.assign(image.style, {
        position: "fixed",
        left: `${startX}px`,
        top: `${startY}px`,
        width: "28px",
        height: "28px",
        objectFit: "contain",
        pointerEvents: "none",
        zIndex: "130",
        filter: "drop-shadow(0 2px 3px rgb(0 0 0 / 0.28))",
      });
      document.body.appendChild(image);

      const flight = image.animate([
        { ...cornFrame(0, 0, 0.55, -fan, 0), offset: 0 },
        { ...cornFrame(-4, -2, 0.88, -16 - fan, 1), offset: 0.1, easing: "ease-in-out" },
        { ...cornFrame(4, 1, 1, 13 - fan, 1), offset: 0.17, easing: "ease-in-out" },
        { ...cornFrame(-2, -1, 1.08, -8 - fan, 1), offset: 0.23, easing: "ease-in-out" },
        { ...cornFrame(0, -24, 1.05, 8 + fan, 1), offset: 0.36 },
        { ...cornFrame(dx * 0.38, dy * 0.32 - 36, 0.88, 125 + fan, 1), offset: 0.62 },
        { ...cornFrame(dx * 0.78, dy * 0.78 - 12, 0.62, 255 - fan, 0.9), offset: 0.84 },
        { ...cornFrame(dx, dy, 0.3, 360 + fan, 0.15), offset: 1 },
      ], {
        duration: 980,
        delay,
        easing: EASE_OUT,
        fill: "forwards",
      });

      flight.onfinish = () => image.remove();
      flight.oncancel = () => image.remove();
    }
  });
}
