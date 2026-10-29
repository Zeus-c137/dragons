/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PROTOTYPE (prototype/collections-showroom): coverflow showroom.
 * Tapping the centered piece grows it in place via a shared-element morph —
 * same card, dimensions animating in real time. Tap outside to shrink it back.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Award, Clock, Loader2, SlidersHorizontal, X } from "lucide-react";
import confetti from "canvas-confetti";
import { sileo } from "sileo";
import { notify } from "../lib/notify";
import type { Collectible, SubscribedNode, SubscriptionItem } from "../types";
import { useCurrency } from "../currency";
import { motion } from "motion/react";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { playCheckinSound, primeCheckinSound } from "../utils/checkinSound";
import { celebrateFeed } from "../utils/feedCelebration";
import { formatClock, getNextFeedingMessage, getRunClaimableReturns, getRunMinimumClaimAmount, getRunTotalDays, isRunCycleFinished, msUntilPlatformMidnight } from "../utils/runs";
import tractor from "@/src/assets/svg/tractor.svg";
import clockSvg from "@/src/assets/svg/clock.svg";
import corn from "@/src/assets/svg/corn.svg";
import priceTag from "@/src/assets/svg/price-tag.svg";
import { getMonthlyGenesisArt } from "../utils/monthlyGenesisArt";

const GROW_SPRING = { type: "spring", duration: 0.5, bounce: 0.15 } as const;

/** Distinguishes repeat hatches of the same egg on the farm grid. */
function formatHatchAge(startDate: string, nowMs: number): string {
  const startedAt = new Date(startDate).getTime();
  if (!Number.isFinite(startedAt)) return "Hatch date unknown";
  const elapsed = Math.max(0, nowMs - startedAt);
  if (elapsed < 60_000) return "Hatched just now";
  if (elapsed < 3_600_000) return `Hatched ${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `Hatched ${Math.floor(elapsed / 3_600_000)}h ago`;
  return `Hatched ${Math.floor(elapsed / 86_400_000)}d ago`;
}

export default function CollectionView({
  phone,
  onBack,
  onClaimed,
  onRefresh,
  activeNodes,
  products,
  onClaimSuccess,
  onNavigateToHistory,
}: {
  phone: string;
  onBack?: () => void;
  onClaimed?: () => void;
  onRefresh?: () => void;
  activeNodes: SubscribedNode[];
  products: SubscriptionItem[];
  onClaimSuccess: (amount: number, balance: number, subId: string, lastClaimedDate: string, status: "active" | "expired", withdrawableBalance?: number, daysFed?: number, deferRefresh?: boolean) => void;
  onNavigateToHistory: () => void;
}) {
  const { formatCurrency } = useCurrency();
  const prefersReducedMotion = useReducedMotion();
  const [items, setItems] = useState<Collectible[] | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [morphKey, setMorphKey] = useState<string | null>(null);
  const [swipeDir, setSwipeDir] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const chickMetricArt = getMonthlyGenesisArt(new Date(nowMs)).chick;
  const [feedingId, setFeedingId] = useState<string | null>(null);
  const [shakingRunIds, setShakingRunIds] = useState<string[]>([]);
  const [revealingRunId, setRevealingRunId] = useState<string | null>(null);
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [farmFilter, setFarmFilter] = useState<"growing" | "completed">("growing");
  const [isFeedingAll, setIsFeedingAll] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rafRef = useRef<number>(0);
  const savedScroll = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/collectibles/${phone}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load your collection.");
      setItems(Array.isArray(data) ? data : []);
    } catch (err: any) {
      notify("error", err.message || "Could not load your collection.");
      setItems([]);
    }
  }, [phone]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const feedChicken = async (node: SubscribedNode, sourceRect: DOMRect) => {
    if (isFeedingAll || feedingId) return;
    const minimumClaimAmount = getRunMinimumClaimAmount(node);
    if (minimumClaimAmount <= 0) {
      notify("info", "This chicken is not configured to earn income.");
      return;
    }
    if (getRunClaimableReturns(node, new Date()).amount < minimumClaimAmount) {
      notify("info", getNextFeedingMessage());
      return;
    }
    primeCheckinSound();
    setFeedingId(node.id);
    try {
      const res = await fetch("/api/subscriptions/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ subId: node.id, phone }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Income could not be collected. Please try again.");
      onClaimSuccess(data.pointsClaimed, data.updatedPoints, node.id, data.lastClaimedDate, data.status, data.updatedWithdrawableBalance, data.daysFed);
      setShakingRunIds((current) => [...new Set([...current, node.id])]);
      window.setTimeout(() => setShakingRunIds((current) => current.filter((id) => id !== node.id)), 900);
      const midpointFeed = Math.ceil(getRunTotalDays(node, products) / 2);
      if (Number(node.daysFed || 0) < midpointFeed && Number(data.daysFed) >= midpointFeed) {
        setRevealingRunId(node.id);
        window.setTimeout(() => setRevealingRunId((current) => current === node.id ? null : current), 900);
      }
      if (!prefersReducedMotion) celebrateFeed([sourceRect]);
      playCheckinSound();
      window.setTimeout(() => sileo.action({
        title: "Chick fed",
        description: `${formatCurrency(Number(data.pointsClaimed) || 0)} has been added to your withdrawable balance.`,
        icon: <img src={corn} alt="" className="h-5 w-5 object-contain" />,
        button: { title: "View history", onClick: onNavigateToHistory },
      }), 3000);
    } catch (err: any) {
      notify("error", err.message || "Income could not be collected.");
    } finally {
      setFeedingId(null);
    }
  };

  // Feed every chicken that has a ready claim today, in one go.
  const handleFeedAll = async () => {
    if (isFeedingAll || feedingId) return;
    const ready = activeChickens.filter((node) => {
      const minimum = getRunMinimumClaimAmount(node);
      return minimum > 0 && getRunClaimableReturns(node, new Date(nowMs)).amount >= minimum;
    });
    if (!ready.length) {
      notify("info", "Nothing to feed right now. Come back after midnight EAT.");
      return;
    }

    primeCheckinSound();
    setIsFeedingAll(true);
    try {
      const results = await Promise.allSettled(ready.map(async (node) => {
        const res = await fetch("/api/subscriptions/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ subId: node.id, phone }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Income could not be collected.");
        onClaimSuccess(data.pointsClaimed, data.updatedPoints, node.id, data.lastClaimedDate, data.status, data.updatedWithdrawableBalance, data.daysFed, true);
        const midpointFeed = Math.ceil(getRunTotalDays(node, products) / 2);
        if (Number(node.daysFed || 0) < midpointFeed && Number(data.daysFed) >= midpointFeed) {
          setRevealingRunId(node.id);
          window.setTimeout(() => setRevealingRunId((current) => current === node.id ? null : current), 900);
        }
        return { runId: node.id, amount: Number(data.pointsClaimed) || 0 };
      }));
      const successful = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const collected = successful.reduce((sum, result) => sum + result.amount, 0);
      const failures = results.filter((result) => result.status === "rejected").length;
      // Every per-run claim was told to skip its own refetch; sync once here.
      if (successful.length > 0) onRefresh?.();
      if (collected > 0) {
        const successfulIds = new Set(successful.map((claim) => claim.runId));
        setShakingRunIds((current) => [...new Set([...current, ...successfulIds])]);
        window.setTimeout(() => setShakingRunIds((current) => current.filter((id) => !successfulIds.has(id))), 900);
        const cardRects = Array.from(document.querySelectorAll<HTMLElement>("[data-feed-run-id]"))
          .filter((card) => {
            const rect = card.getBoundingClientRect();
            return successfulIds.has(card.dataset.feedRunId || "") && rect.bottom > 0 && rect.top < window.innerHeight;
          })
          .map((card) => card.getBoundingClientRect());
        if (!prefersReducedMotion && cardRects.length) celebrateFeed(cardRects, true);
        playCheckinSound();
        window.setTimeout(() => sileo.action({
          title: "Chicks fed",
          description: `${formatCurrency(collected)} has been added to your withdrawable balance.`,
          icon: <img src={corn} alt="" className="h-5 w-5 object-contain" />,
          button: { title: "View history", onClick: onNavigateToHistory },
        }), 3000);
      }
      if (failures > 0) notify("error", "Some chickens could not be fed. Please try again.");
    } finally {
      setIsFeedingAll(false);
    }
  };

  const keepHen = async (node: SubscribedNode) => {
    if (collectingId) return;
    setCollectingId(node.id);
    try {
      const res = await fetch("/api/collectibles/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ phone, subscriptionId: node.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.collectible) throw new Error(data.error || "Hen could not be kept.");
      setItems((current) => [
        ...(current || []).filter((collectible) => collectible.subscriptionId !== node.id),
        data.collectible,
      ]);
      confetti({ particleCount: 130, spread: 75, origin: { y: 0.6 } });
      sileo.action({
        title: "Hen kept",
        description: `Collectible #${String(data.collectible.serial || 0).padStart(3, "0")} is in your showroom.`,
        button: {
          title: "View showroom",
          onClick: () => window.setTimeout(() => {
            document.getElementById("collection-showroom")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 150),
        },
      });
      onClaimed?.();
    } catch (err: any) {
      notify("error", err.message || "Hen could not be kept.");
    } finally {
      setCollectingId(null);
    }
  };

  const claimed = (items || []).filter((c) => c.claimedAt);
  const chickenNodes = activeNodes.filter((node) => Boolean(node.eggImageUrl && node.dragonImageUrl));
  const activeChickens = chickenNodes.filter((node) => !isRunCycleFinished(node));
  const completedCycles = chickenNodes.filter((node) => isRunCycleFinished(node));
  const displayedChickens = farmFilter === "growing" ? activeChickens : completedCycles;
  const completedIds = new Set(completedCycles.map((node) => node.id));
  const completedCount = completedCycles.length;
  const completedEarned = completedCycles.reduce((sum, node) => {
    const collectible = (items || []).find((entry) => entry.subscriptionId === node.id);
    return sum + (collectible ? Number(collectible.totalEarned) || 0 : Number(node.totalEarned) || 0);
  }, 0) + (items || []).reduce((sum, collectible) => completedIds.has(collectible.subscriptionId) ? sum : sum + (Number(collectible.totalEarned) || 0), 0);
  const activeDailyIncome = activeChickens.reduce((sum, node) => sum + getRunMinimumClaimAmount(node), 0);
  const readyChickenCount = activeChickens.filter((node) => {
    const minimum = getRunMinimumClaimAmount(node);
    return minimum > 0 && getRunClaimableReturns(node, new Date(nowMs)).amount >= minimum;
  }).length;
  const activeCollectible = claimed[activeIndex] || claimed[0] || null;
  const expanded = expandedId ? claimed.find((c) => c.id === expandedId) || null : null;
  const growTransition = prefersReducedMotion ? { duration: 0 } : GROW_SPRING;

  const updateActive = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el || el.children.length === 0) return;
      const viewportCenter = el.scrollLeft + el.clientWidth / 2;
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      Array.from(el.children).forEach((child, index) => {
        const card = child as HTMLElement;
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const distance = Math.abs(cardCenter - viewportCenter);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      setActiveIndex(nearestIndex);
    });
  }, []);

  const centerOn = (i: number) => {
    const el = scrollRef.current;
    if (!el || el.children.length === 0) return;
    const target = el.children[i] as HTMLElement | undefined;
    if (!target) return;
    const left = target.offsetLeft - (el.clientWidth - target.offsetWidth) / 2;
    el.scrollTo({ left, behavior: prefersReducedMotion ? "auto" : "smooth" });
  };

  const selectArtwork = (i: number) => {
    if (expanded) {
      setActiveIndex(i);
      collapse();
    } else {
      centerOn(i);
    }
  };

  useEffect(() => {
    const scroller = tabsRef.current;
    const tab = tabRefs.current[activeIndex];
    if (!scroller || !tab) return;
    const containerRect = scroller.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const left = scroller.scrollLeft + tabRect.left - containerRect.left - (scroller.clientWidth - tabRect.width) / 2;
    scroller.scrollTo({ left, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [activeIndex, expandedId, prefersReducedMotion]);

  const expand = (c: Collectible) => {
    if (scrollRef.current) savedScroll.current = scrollRef.current.scrollLeft;
    const idx = claimed.findIndex((x) => x.id === c.id);
    if (idx >= 0) setActiveIndex(idx);
    setMorphKey(`vault-${c.id}`);
    setExpandedId(c.id);
  };

  const collapse = () => {
    if (expanded) setMorphKey(`vault-${expanded.id}`);
    setExpandedId(null);
    setSwipeDir(0);
  };

  // Swipe navigation inside the expanded card.
  const navigate = (dir: 1 | -1) => {
    if (!expanded || claimed.length < 2) return;
    const idx = claimed.findIndex((c) => c.id === expanded.id);
    if (idx < 0) return;
    const next = (idx + dir + claimed.length) % claimed.length;
    setSwipeDir(dir);
    setExpandedId(claimed[next].id);
    setActiveIndex(next);
  };

  const handleSwipe = (_e: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (info.offset.x < -70 || info.velocity.x < -500) navigate(1);
    else if (info.offset.x > 70 || info.velocity.x > 500) navigate(-1);
  };

  // Park the flow on the card the user ended on — but ONLY on the collapse
  // edge. Keying this on activeIndex made it fire during ordinary flow
  // scrolling and rewrite scrollLeft mid-swipe, which read as jitter.
  const wasExpanded = useRef(false);
  useLayoutEffect(() => {
    const justCollapsed = wasExpanded.current && !expandedId;
    wasExpanded.current = !!expandedId;
    if (!justCollapsed || !scrollRef.current) return;
    const el = scrollRef.current;
    const target = el.children[activeIndex] as HTMLElement | undefined;
    if (!target) return;
    el.scrollLeft = target.offsetLeft - (el.clientWidth - target.offsetWidth) / 2;
  }, [expandedId, activeIndex]);

  return (
    <div className="space-y-5 select-none bg-transparent text-[var(--theme-text)] p-1 pb-32 relative">
     

    
      <section aria-label={farmFilter === "growing" ? "Active chickens" : "Completed cycles"} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="on-app-gold-text font-display text-[18px] font-black">{farmFilter === "growing" ? "Growing chickens" : "Completed cycles"}</h2>

            <div className="flex shrink-0 items-center gap-2">
              {farmFilter === "growing" ? (
                <button
                  type="button"
                  onClick={() => void handleFeedAll()}
                  disabled={isFeedingAll || readyChickenCount === 0}
                  aria-label="Feed all chickens with a ready collection today"
                  title={readyChickenCount > 0 ? "Feed all ready chickens" : "Nothing is ready to feed yet"}
                  className="user-glossy-button inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3.5 text-[var(--theme-on-primary)] transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isFeedingAll ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <img src={corn} alt="" aria-hidden="true" className="h-4.5 w-4.5 object-contain" />}
                  <span className="text-[12px] font-black">{isFeedingAll ? "Feeding…" : "Feed all"}</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setFarmFilter((current) => current === "growing" ? "completed" : "growing")}
                aria-label={farmFilter === "growing" ? "Show completed cycles" : "Show growing chickens"}
                title={farmFilter === "growing" ? "Show completed cycles" : "Show growing chickens"}
                aria-pressed={farmFilter === "completed"}
                className={`user-glossy-button inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--theme-on-primary)] transition-all ${farmFilter === "completed" ? "brightness-90" : ""}`}
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-[22px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-4">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="flex items-center gap-1.5 text-[11px] font-bold opacity-70">
                <img src={chickMetricArt} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                {farmFilter === "growing" ? "Growing chickens" : "Completed cycles"}
              </p>
              <p className="font-display text-[28px] font-black leading-none tabular-nums">{farmFilter === "growing" ? activeChickens.length : completedCount}</p>
            </div>
            <div className="flex min-w-0 flex-col items-end gap-1 text-right">
              <p className="flex items-center justify-end gap-1.5 text-[11px] font-bold opacity-70">
                <img src={corn} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                {farmFilter === "growing" ? "Income per day" : "Total earned"}
              </p>
              <p className="font-display text-[18px] font-black leading-tight tabular-nums">{formatCurrency(farmFilter === "growing" ? activeDailyIncome : completedEarned)}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {displayedChickens.map((node, index) => {
              const totalDays = getRunTotalDays(node, products);
              const daysFed = Math.max(0, Math.floor(Number(node.daysFed) || 0));
              const cycleFinished = farmFilter === "completed";
              const cycleDay = cycleFinished ? totalDays : Math.min(totalDays, daysFed + 1);
              const dailyIncome = getRunMinimumClaimAmount(node);
              const claimable = getRunClaimableReturns(node, new Date(nowMs));
              const ready = dailyIncome > 0 && claimable.amount >= dailyIncome;
              const finalFeed = !cycleFinished && daysFed + 1 >= totalDays;
              const mature = cycleFinished || daysFed >= Math.ceil(totalDays / 2);
              const artwork = mature ? node.dragonImageUrl : node.youngDragonImageUrl || node.dragonImageUrl;
              const progress = cycleFinished ? 100 : Math.min(100, Math.max(0, cycleDay / totalDays * 100));
              const product = products.find((entry) => entry.id === node.itemId);
              const collectible = (items || []).find((entry) => entry.subscriptionId === node.id);
              const kept = Boolean(collectible?.claimedAt);
              return (
                <article key={node.id} data-feed-run-id={node.id} className={`feed-celebration-card overflow-hidden rounded-[20px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] ${shakingRunIds.includes(node.id) ? "is-shaking" : ""}`}>
                  <div
                    className="relative isolate flex aspect-[1.85] items-center justify-center overflow-hidden bg-cover bg-center p-3"
                    style={{
                      backgroundImage: `url("https://i.pinimg.com/736x/98/51/02/98510286e9c4a9111bfda2129c80d7a3.jpg")`,
                    }}
                  >
                    <span className="dragon-chicken-art dragon-chicken-art-contained relative z-10" style={{ animationDelay: `${(index % 5) * -0.55}s` }}>
                      <img src={artwork} alt={`${node.itemName} ${mature ? "hen" : "chick"}`} loading="lazy" className={`h-full w-full object-contain${revealingRunId === node.id ? " dragon-hatch-reveal" : ""}`} />
                    </span>
                    <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1">
                      <span className="rounded-full bg-[var(--theme-bg)]/85 px-2.5 py-1 text-[11px] font-bold text-[var(--theme-text)]">{product?.category || "Chicken"}</span>
                      <span className="rounded-full bg-[var(--theme-bg)]/85 px-2.5 py-1 text-[10px] font-bold text-[var(--theme-text)]/80">{formatHatchAge(node.startDate, nowMs)}</span>
                    </div>
                  </div>
                  <div className="space-y-2.5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="min-w-0 truncate font-display text-[18px] font-black">{node.itemName}</h3>
                      <p className="inline-flex shrink-0 items-center gap-1 font-display text-[17px] font-black tabular-nums">
                        <img src={priceTag} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
                        {formatCurrency(node.amount)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-[14px]">
                      <span className="inline-flex items-center gap-1.5 opacity-70"><Clock className="h-3.5 w-3.5" aria-hidden="true" /> Income per day</span>
                      <span className="inline-flex items-center gap-1 font-display text-[17px] font-semibold tabular-nums">
                        <img src={corn} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
                        {formatCurrency(dailyIncome)}
                      </span>
                    </div>
                    <div className={`feed-cycle-progress space-y-2 ${ready ? "is-ready" : ""}`} aria-label={`Cycle progress: day ${cycleDay} of ${totalDays}`}>
                      <div className="flex items-center gap-2">
                        <div role="progressbar" aria-label="Chicken cycle progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="feed-corn-rail min-w-0 flex-1">
                          <div className="feed-corn-fill" style={{ width: `${progress}%` }}>
                            {Array.from({ length: 10 }, (_, kernelIndex) => <img key={kernelIndex} src={corn} alt="" aria-hidden="true" />)}
                          </div>
                          <img src={corn} alt="" aria-hidden="true" className={`feed-next-kernel ${ready ? "is-ready" : ""}`} style={{ left: `${Math.min(96, Math.max(4, progress))}%` }} />
                        </div>
                        <span aria-label={`Cycle day ${cycleDay} of ${totalDays}`} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--theme-primary)]/55 px-2 py-0.5 text-[10px] font-sans font-semibold leading-none tabular-nums text-[var(--theme-accent)]">
                          <img src={clockSvg} alt="" aria-hidden="true" className="h-3.5 w-3.5" /> Day {cycleDay}/{totalDays}
                        </span>
                      </div>
                    </div>
                    {finalFeed ? (
                      <p className="text-center text-[10px] font-black uppercase tracking-[0.12em] text-[var(--theme-accent)]">
                        Final feed · this hen moves to Completed
                      </p>
                    ) : null}
                    {cycleFinished ? (
                      kept ? (
                        <div
                          role="status"
                          aria-label={`${node.itemName} hen kept. It is in the showroom below.`}
                          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[var(--theme-primary)]/35 bg-[var(--theme-primary)]/10 px-3 py-2.5 text-[13px] font-sans font-black text-[var(--theme-accent)]"
                        >
                          <Award className="h-4 w-4" aria-hidden="true" />
                          Kept hen
                        </div>
                      ) : (
                        <button type="button" disabled={collectingId === node.id} onClick={() => void keepHen(node)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--theme-primary)] px-3 py-2.5 text-[13px] font-sans font-black text-[var(--theme-on-primary)] disabled:opacity-60">
                          {collectingId === node.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Award className="h-4 w-4" aria-hidden="true" />}
                          Keep hen
                        </button>
                      )
                    ) : (
                      <div className="flex justify-center">
                        <button
                          type="button"
                          disabled={isFeedingAll || feedingId === node.id}
                          aria-disabled={!ready}
                          onClick={(event) => {
                            const card = event.currentTarget.closest<HTMLElement>("[data-feed-run-id]");
                            void feedChicken(node, card?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect());
                          }}
                          aria-label={ready
                            ? `Feed chick. Daily income ${formatCurrency(node.dailyYield)} is ready to collect.`
                            : dailyIncome > 0
                              ? `Feed chick. Next feed in ${formatClock(msUntilPlatformMidnight(nowMs))}.`
                              : "Feed chick. This chicken is not configured to earn income."}
                          className={`user-glossy-button user-glossy-button--small feed-action-button inline-flex w-36 shrink-0 items-center justify-center gap-1.5 rounded-[14px] text-[var(--theme-on-primary)] active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 ${ready ? "is-ready" : "is-waiting"}`}
                        >
                          {feedingId === node.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            : <img src={corn} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />}
                          <span className="font-display text-[13px] font-black tabular-nums">
                            {ready ? "Feed" : dailyIncome > 0 ? formatClock(msUntilPlatformMidnight(nowMs)) : "—"}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {displayedChickens.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-[var(--theme-card-border)] px-5 py-7 text-center text-sm font-semibold opacity-60">
              {farmFilter === "growing" ? "No chickens are growing right now." : "No completed cycles yet."}
            </div>
          ) : null}
      </section>

      {farmFilter === "completed" && (items === null ? (
        <div aria-hidden="true" className="space-y-3">
          <div className="h-[300px] rounded-[24px] border border-white/10 bg-[var(--theme-card-bg)] animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-[24px] border border-white/10 bg-[var(--theme-card-bg)] p-3 animate-pulse">
                <div className="aspect-square rounded-xl bg-[var(--theme-text)]/10" />
                <div className="mt-2 h-[14px] w-2/3 rounded bg-[var(--theme-text)]/10" />
              </div>
            ))}
          </div>
        </div>
      ) : items.length === 0 ? null : (
        <div className="space-y-5">
          {/* Coverflow showroom — claimed collectibles */}
          {claimed.length > 0 && (
            <div id="collection-showroom" className="space-y-4" onClick={expanded ? collapse : undefined}>
              <div className="flex items-baseline justify-between gap-3 px-1">
                <div className="min-w-0">
                  <p className="text-[10px] font-sans font-black uppercase tracking-[0.14em] opacity-50">Finished hens</p>
                  <h3 className="mt-1 truncate font-display font-black text-[15px]">{activeCollectible?.itemName || "Your farm"}</h3>
                </div>
                <p className="font-display font-bold text-[12px] tabular-nums text-[var(--theme-text)] opacity-55">
                  {String(Math.min(activeIndex + 1, claimed.length)).padStart(2, "0")} / {String(claimed.length).padStart(2, "0")}
                </p>
              </div>
              <div
                ref={tabsRef}
                role="tablist"
                aria-label="Collected artworks"
                className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1"
              >
                {claimed.map((c, i) => (
                  <button
                    key={c.id}
                    ref={(el) => { tabRefs.current[i] = el; }}
                    type="button"
                    role="tab"
                    aria-selected={i === activeIndex}
                    aria-controls={`collection-artwork-${c.id}`}
                    tabIndex={i === activeIndex ? 0 : -1}
                    onClick={(e) => { e.stopPropagation(); selectArtwork(i); }}
                    onKeyDown={(e) => {
                      let next = i;
                      if (e.key === "ArrowRight") next = (i + 1) % claimed.length;
                      else if (e.key === "ArrowLeft") next = (i - 1 + claimed.length) % claimed.length;
                      else if (e.key === "Home") next = 0;
                      else if (e.key === "End") next = claimed.length - 1;
                      else return;
                      e.preventDefault();
                      tabRefs.current[next]?.focus();
                      selectArtwork(next);
                    }}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-sans font-bold transition-colors ${i === activeIndex ? "border-[var(--theme-primary)]/50 bg-[var(--theme-primary)]/15 text-[var(--theme-accent)]" : "border-white/10 bg-[var(--theme-card-bg)] opacity-65"}`}
                  >
                    <span className="max-w-[120px] truncate">{c.itemName}</span>
                    <span className="opacity-60">#{String(c.serial).padStart(3, "0")}</span>
                  </button>
                ))}
              </div>
              {expanded ? (
                <div className="relative">
                  <motion.button
                    type="button"
                    aria-label="Close expanded view"
                    onClick={(e) => { e.stopPropagation(); collapse(); }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: prefersReducedMotion ? 0 : 0.25, duration: 0.2 }}
                    className="absolute left-1/2 -translate-x-1/2 -top-[38px] z-10 w-8 h-8 flex items-center justify-center rounded-full border border-white/10 bg-[var(--theme-card-bg)] text-[var(--theme-text)] shadow-lg cursor-pointer active:scale-95 transition-transform"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                  <motion.div
                    key="expanded-view"
                    id={`collection-artwork-${expanded.id}`}
                    layoutId={morphKey ?? undefined}
                    onLayoutAnimationComplete={() => setMorphKey(null)}
                    transition={growTransition}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.14}
                    onDragEnd={handleSwipe as never}
                    onClick={(e) => e.stopPropagation()}
                    className="relative rounded-[24px] border border-[var(--theme-primary)]/50 bg-[var(--theme-card-bg)] p-4 overflow-hidden tile-shimmer-5s"
                  >
                    <motion.div
                      key={expanded.id}
                      initial={{ opacity: 0, x: swipeDir * 48 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.3, ease: [0.23, 1, 0.32, 1] }}
                    >
                      <div
                        onClick={(e) => { e.stopPropagation(); expanded.image && setPreviewImage(expanded.image); }}
                        className="relative aspect-square rounded-2xl overflow-hidden bg-[var(--theme-text)]/5 cursor-zoom-in"
                      >
                        {expanded.image ? (
                          <img src={expanded.image} alt={expanded.itemName} loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-contain p-4 pointer-events-none" draggable={false} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center opacity-40">
                            <Award className="w-12 h-12" />
                          </div>
                        )}
                      </div>
                      <div className="mt-4 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-display font-black text-[20px] leading-tight">{expanded.itemName}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-[12px] font-sans opacity-55">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>{expanded.duration}d cycle</span>
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-display font-black text-[13px] text-[var(--theme-accent)] tabular-nums">
                            #{String(expanded.serial).padStart(3, "0")}
                          </p>
                          <p className="mt-0.5 font-display font-black text-[13px] text-[var(--theme-accent)] tabular-nums">
                            Earned {formatCurrency(expanded.totalEarned)}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                </div>
              ) : (
                <div
                  ref={scrollRef}
                  onScroll={updateActive}
                  className="relative flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-none -mx-1 px-[7%] pb-2 pt-1"
                  style={{ perspective: "1200px" }}
                >
                  {claimed.map((c: Collectible, i: number) => {
                    const d = i - activeIndex;
                    const ad = Math.abs(d);
                    const scale = 1 - Math.min(ad * 0.1, 0.3);
                    const rotateY = prefersReducedMotion ? 0 : Math.max(-32, Math.min(32, -d * 18));
                    const dim = ad > 0;
                    return (
                      <motion.div
                        key={`vault-${c.id}`}
                        id={`collection-artwork-${c.id}`}
                        layoutId={`vault-${c.id}`}
                        transition={growTransition}
                        className="shrink-0 w-[86%] snap-center cursor-pointer"
                        onClick={() => { if (i === activeIndex) expand(c); else centerOn(i); }}
                      >
                        <div
                          className={`rounded-[24px] border p-4 overflow-hidden relative transition-colors duration-200 ${i === activeIndex ? "border-[var(--theme-primary)]/50 bg-[var(--theme-card-bg)] shadow-[0_0_32px_rgba(0,0,0,0.25)]" : "border-white/10 bg-[var(--theme-card-bg)]"}`}
                          style={{
                            transform: `scale(${scale}) rotateY(${rotateY}deg)`,
                            opacity: ad > 2 ? 0.45 : 1,
                            filter: dim ? "blur(1px) brightness(0.85)" : "none",
                            transition: "transform 200ms ease-out, opacity 200ms ease-out, filter 200ms ease-out",
                            transformStyle: "preserve-3d",
                          }}
                        >
                          <div className="relative aspect-square rounded-2xl overflow-hidden bg-[var(--theme-text)]/5">
                            {c.image ? (
                              <img src={c.image} alt={c.itemName} loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-contain p-3 pointer-events-none" draggable={false} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center opacity-40">
                                <Award className="w-12 h-12" />
                              </div>
                            )}
                          </div>
                          <div className="mt-3 flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-display font-black text-[15px] leading-tight truncate">{c.itemName}</p>
                              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-sans opacity-55">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span>{c.duration}d cycle</span>
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-display font-black text-[11px] text-[var(--theme-accent)] tabular-nums">
                                #{String(c.serial).padStart(3, "0")}
                              </p>
                              <p className="mt-0.5 font-display font-black text-[11px] text-[var(--theme-accent)] tabular-nums">
                                Earned {formatCurrency(c.totalEarned)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      ))}

      {previewImage && (
        <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} alt="Preview" className="max-w-full max-h-[85vh] rounded-[var(--theme-radius)] shadow-2xl object-contain" />
        </div>
      )}
    </div>
  );
}
