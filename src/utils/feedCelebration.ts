import confetti from "canvas-confetti";

const CORN_PATH = "M 9 0 C 14 0 18 4 18 10 C 18 16 14 22 9 25 C 4 22 0 16 0 10 C 0 4 4 0 9 0 Z";
let cornShape: confetti.Shape | null = null;

export function getCornConfettiShape(): confetti.Shape {
  if (!cornShape) cornShape = confetti.shapeFromPath(CORN_PATH);
  return cornShape;
}

export function celebrateFeed(sourceRects: DOMRect[], feedAll = false): void {
  if (!sourceRects.length) return;

  try {
    const sources = sourceRects.slice(0, 12);
    const totalParticles = feedAll ? 168 : 84;
    const particlesPerSource = Math.max(14, Math.ceil(totalParticles / sources.length));
    const balanceRect = document.querySelector<HTMLElement>(".user-app-withdrawable-balance")?.getBoundingClientRect();

    sources.forEach((sourceRect, index) => {
      const startX = sourceRect.left + sourceRect.width / 2;
      const startY = sourceRect.top + sourceRect.height / 2;
      const targetX = balanceRect ? balanceRect.left + balanceRect.width / 2 : startX;
      const targetY = balanceRect ? balanceRect.top + balanceRect.height / 2 : startY - 1;

      confetti({
        particleCount: particlesPerSource,
        angle: balanceRect ? Math.atan2(startY - targetY, targetX - startX) * (180 / Math.PI) : 84,
        spread: feedAll ? 62 : 48,
        startVelocity: feedAll ? 38 : 35,
        gravity: 0.55,
        decay: 0.91,
        ticks: 78,
        scalar: 0.92,
        shapes: [getCornConfettiShape()],
        origin: {
          x: Math.min(0.98, Math.max(0.02, startX / window.innerWidth)),
          y: Math.min(0.98, Math.max(0.02, startY / window.innerHeight)),
        },
        zIndex: 130,
        disableForReducedMotion: true,
        drift: index % 2 === 0 ? -0.25 : 0.25,
      });
    });
  } catch {
    // A visual celebration should never interfere with a successful claim.
  }
}
