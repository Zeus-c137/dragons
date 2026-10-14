import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Award, Check, Clock, Egg, Gift, History, Loader2, LogOut, Menu, Wallet, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import { useGatedInterval } from "../hooks/useGatedInterval";
import type { Collectible, SubscribedNode, SubscriptionItem, UserProfile } from "../types";
import { readApiJson } from "../utils/api";
import { getRunClaimableReturns, getRunEndMs, getRunMinimumClaimAmount } from "../utils/runs";
import { isDragonEggProduct } from "../utils/dragons";

import egg from "@/src/assets/svg/celestial.png";

type Props = {
  isActive: boolean;
  profile: UserProfile;
  activeNodes: SubscribedNode[];
  items: SubscriptionItem[];
  onSubscribeSuccess: (node: SubscribedNode, amount: number) => void;
  onClaimSuccess: (amount: number, balance: number, subId: string, lastClaimedDate: string, status: "active" | "expired") => void;
  onProfileUpdate: (profile: UserProfile) => void;
  onNavigateToCollection: () => void;
  onNavigateToHistory: () => void;
  onSignOut: () => void;
};

function AnimatedUgxAmount({ amount }: { amount: number }) {
  const target = Math.max(0, Math.floor(Number(amount) || 0));
  const [displayedAmount, setDisplayedAmount] = useState(target);
  const displayedAmountRef = useRef(displayedAmount);

  useEffect(() => {
    const startAmount = displayedAmountRef.current;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (target <= startAmount || prefersReducedMotion) {
      displayedAmountRef.current = target;
      setDisplayedAmount(target);
      return;
    }

    let startTime = 0;
    let frameId = 0;
    const durationMs = 420;
    const animate = (time: number) => {
      if (startTime === 0) startTime = time;
      const progress = Math.min(1, (time - startTime) / durationMs);
      const easedProgress = 1 - Math.pow(1 - progress, 4);
      const nextAmount = progress === 1
        ? target
        : Math.floor(startAmount + (target - startAmount) * easedProgress);
      displayedAmountRef.current = nextAmount;
      setDisplayedAmount(nextAmount);
      if (progress < 1) frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [target]);

  return (
    <span aria-live="off" className="inline-flex items-baseline gap-1.5">
      <span className="font-sans text-[11px] font-bold tracking-wide text-[var(--theme-text)] opacity-55">UGX</span>
      <span className="font-display text-[28px] font-black text-[var(--theme-primary)]">
        {displayedAmount.toLocaleString("en-UG", { maximumFractionDigits: 0 })}
      </span>
    </span>
  );
}

function formatWholeUgx(amount: number): string {
  return Math.max(0, Math.floor(Number(amount) || 0)).toLocaleString("en-UG", { maximumFractionDigits: 0 });
}

export default function DragonsHomeSection({
  isActive,
  profile,
  activeNodes,
  items,
  onSubscribeSuccess,
  onClaimSuccess,
  onProfileUpdate,
  onNavigateToCollection,
  onNavigateToHistory,
  onSignOut,
}: Props) {
  const { formatCurrency } = useCurrency();
  const prefersReducedMotion = useReducedMotion();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [confirmingEgg, setConfirmingEgg] = useState<SubscriptionItem | null>(null);
  const [openingEggId, setOpeningEggId] = useState<string | null>(null);
  const [hatchingEggId, setHatchingEggId] = useState<string | null>(null);
  const [revealingDragonId, setRevealingDragonId] = useState<string | null>(null);
  const [claimingNodeId, setClaimingNodeId] = useState<string | null>(null);
  const [collectibles, setCollectibles] = useState<Collectible[]>([]);
  const [collectiblesLoaded, setCollectiblesLoaded] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [homeGiftCodeOpen, setHomeGiftCodeOpen] = useState(false);
  const [giftCodeValue, setGiftCodeValue] = useState("");
  const [isRedeemingGiftCode, setIsRedeemingGiftCode] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const closeSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const homeGiftCodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!settingsMenuOpen) return;
    closeSettingsButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsMenuOpen(false);
        settingsButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [settingsMenuOpen]);

  useEffect(() => {
    if (!homeGiftCodeOpen) return;
    homeGiftCodeInputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHomeGiftCodeOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [homeGiftCodeOpen]);

  const handleHomeGiftCodeRedeem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = giftCodeValue.trim().toUpperCase();
    if (!code || isRedeemingGiftCode) return;
    setIsRedeemingGiftCode(true);
    try {
      const response = await fetch("/api/user/redeem_gift_code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: profile.id, code }),
      });
      const data = await readApiJson<{ amount: number }>(response);
      const amount = Math.max(0, Number(data.amount) || 0);
      onProfileUpdate({ ...profile, points: (Number(profile.points) || 0) + amount });
      toast.success(`Redeemed gift code of ${formatCurrency(amount)}.`);
      setGiftCodeValue("");
      setHomeGiftCodeOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not redeem this gift code.");
    } finally {
      setIsRedeemingGiftCode(false);
    }
  };

  const eggs = useMemo(
    () => items.filter((item) => !item.disabled && isDragonEggProduct(item)),
    [items]
  );
  const enabledProductCount = useMemo(() => items.filter((item) => !item.disabled).length, [items]);
  useGatedInterval(() => setNowMs(Date.now()), 1_000, {
    enabled: isActive,
    visibilityGate: true,
    runOnVisible: true
  });

  const latestNodes = useMemo(() => {
    const byItemId = new Map<string, SubscribedNode>();
    for (const node of activeNodes) {
      if (!node.eggImageUrl || !node.dragonImageUrl) continue;
      const existing = byItemId.get(node.itemId);
      if (!existing || new Date(node.startDate).getTime() > new Date(existing.startDate).getTime()) {
        byItemId.set(node.itemId, node);
      }
    }
    return byItemId;
  }, [activeNodes]);
  const completedNodeIds = useMemo(() => activeNodes
    .filter((node) => {
      if (!node.eggImageUrl || !node.dragonImageUrl) return false;
      const endMs = getRunEndMs(node);
      return String(node.status).toLowerCase() !== "active" || endMs !== null && nowMs >= endMs;
    })
    .map((node) => node.id)
    .sort()
    .join(","), [activeNodes, nowMs]);

  useEffect(() => {
    const controller = new AbortController();
    setCollectiblesLoaded(false);
    fetch(`/api/collectibles/${profile.id}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await readApiJson<Collectible[]>(response);
        setCollectibles(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setCollectibles([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCollectiblesLoaded(true);
      });
    return () => controller.abort();
  }, [profile.id, completedNodeIds]);
  const hatchCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of activeNodes) {
      if (!node.eggImageUrl || !node.dragonImageUrl) continue;
      counts.set(node.itemId, (counts.get(node.itemId) || 0) + 1);
    }
    return counts;
  }, [activeNodes]);
  const isNodeInCycle = (node: SubscribedNode | undefined) => {
    if (!node || String(node.status).toLowerCase() !== "active") return false;
    const endMs = getRunEndMs(node);
    return endMs === null || nowMs < endMs;
  };
  const hatchedCount = eggs.filter((egg) => isNodeInCycle(latestNodes.get(egg.id))).length;
  const dailyIncome = [...latestNodes.values()]
    .filter((node) => {
      const endMs = getRunEndMs(node);
      return String(node.status).toLowerCase() === "active" && (endMs === null || nowMs < endMs);
    })
    .reduce((sum, node) => sum + Math.max(0, Number(node.dailyYield) || 0), 0);
  const handleOpenEgg = async () => {
    if (!confirmingEgg || openingEggId) return;
    const egg = confirmingEgg;
    setOpeningEggId(egg.id);
    try {
      const response = await fetch("/api/items/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ phone: profile.id, itemId: egg.id }),
      });
      const data = await readApiJson<{ success: boolean; subscription: SubscribedNode }>(response);
      if (!data.success || !data.subscription) throw new Error("The egg could not be opened. Please try again.");
      setConfirmingEgg(null);
      onSubscribeSuccess(data.subscription, egg.amount);
      setHatchingEggId(egg.id);
      const hatchDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 2200;
      await new Promise((resolve) => window.setTimeout(resolve, hatchDuration));
      setRevealingDragonId(egg.id);
      window.setTimeout(() => setRevealingDragonId((current) => current === egg.id ? null : current), 900);
      toast.success(`${egg.name} hatched! Your dragon is now in your valley.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The egg could not be opened.");
    } finally {
      setOpeningEggId(null);
      setHatchingEggId(null);
    }
  };

  const handleClaimIncome = async (node: SubscribedNode) => {
    const now = new Date();
    const accrued = getRunClaimableReturns(node, now).amount;
    const nodeEndMs = getRunEndMs(node);
    const cycleFinished = String(node.status).toLowerCase() !== "active" || nodeEndMs !== null && now.getTime() >= nodeEndMs;
    const minimumClaimAmount = getRunMinimumClaimAmount(node);
    if (!cycleFinished && accrued < minimumClaimAmount) {
      toast.error(`You need at least ${formatCurrency(minimumClaimAmount)} accrued before collecting.`);
      return;
    }
    if (cycleFinished && accrued <= 0) {
      toast.error("There is no accrued income left to collect.");
      return;
    }

    setClaimingNodeId(node.id);
    try {
      const response = await fetch("/api/subscriptions/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ subId: node.id, phone: profile.id }),
      });
      const data = await readApiJson<{
        success: boolean;
        pointsClaimed: number;
        updatedPoints: number;
        lastClaimedDate: string;
        status: "active" | "expired";
        itemName: string;
      }>(response);
      if (!data.success) throw new Error("Income could not be collected. Please try again.");
      onClaimSuccess(data.pointsClaimed, data.updatedPoints, node.id, data.lastClaimedDate, data.status);
      toast.success(`${formatCurrency(data.pointsClaimed)} collected from ${data.itemName}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Income could not be collected.");
    } finally {
      setClaimingNodeId(null);
    }
  };

  const handleCollectDragon = async (node: SubscribedNode) => {
    setClaimingNodeId(node.id);
    try {
      const response = await fetch("/api/collectibles/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ phone: profile.id, subscriptionId: node.id }),
      });
      const data = await readApiJson<{ success: boolean; collectible: Collectible }>(response);
      if (!data.success || !data.collectible) throw new Error("Dragon could not be added to your collection. Please try again.");
      setCollectibles((current) => [
        ...current.filter((collectible) => collectible.subscriptionId !== node.id),
        data.collectible,
      ]);
      toast.success(`${data.collectible.itemName} added to your collection!`);
      onNavigateToCollection();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dragon could not be added to your collection.");
    } finally {
      setClaimingNodeId(null);
    }
  };

  return (
    <section className="space-y-5">
      <div className="sticky top-2 z-40 ml-auto -mb-[88px] h-[88px] w-11">
        <button
          ref={settingsButtonRef}
          type="button"
          aria-label="Open home menu"
          aria-haspopup="dialog"
          aria-expanded={settingsMenuOpen}
          onClick={() => setSettingsMenuOpen(true)}
          className="absolute right-0 top-0 grid h-10 w-10 place-items-center rounded-2xl border border-white/20 bg-[var(--theme-card-bg)]/70 text-[var(--theme-text)] shadow-lg backdrop-blur-xl transition-colors hover:bg-[var(--theme-card-bg)]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Open gift codes"
          aria-haspopup="dialog"
          aria-expanded={homeGiftCodeOpen}
          onClick={() => setHomeGiftCodeOpen(true)}
          className="absolute right-0 top-12 grid h-10 w-10 place-items-center rounded-2xl border border-white/20 bg-[var(--theme-card-bg)]/70 text-[var(--theme-primary)] shadow-lg backdrop-blur-xl transition-colors hover:bg-[var(--theme-card-bg)]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]"
        >
          <Gift className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <header className="space-y-1 justify-center text-center flex flex-col px-1">
        <div className="relative flex min-h-8 items-center justify-center px-10">
          <p className="text-[14px] font-sans font-black uppercase tracking-[0.18em] text-[var(--theme-primary)]">Valley of dragons</p>
        </div>
        <h1 className="max-w-[28rem] font-display px-12 text-[25px] font-black leading-tight tracking-tight text-[var(--theme-text)]">
          Choose an egg and hatch your dragon!
        </h1>
      </header>

      <AnimatePresence>
        {settingsMenuOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.24, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 sm:p-5"
            onClick={() => setSettingsMenuOpen(false)}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="home-settings-title"
              onClick={(event) => event.stopPropagation()}
              initial={{ opacity: 0, x: prefersReducedMotion ? 0 : "100vw" }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: prefersReducedMotion ? 0 : "100vw" }}
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.3, ease: [0.32, 0.72, 0, 1] }}
              className="w-full max-w-sm rounded-[26px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-4 text-[var(--theme-text)] shadow-2xl"
            >
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <h2 id="home-settings-title" className="font-display text-lg font-black">Quick menu</h2>
                <button
                  ref={closeSettingsButtonRef}
                  type="button"
                 
                  aria-label="Close menu"
                  onClick={() => {
                    setSettingsMenuOpen(false);
                    settingsButtonRef.current?.focus();
                  }}
                  className="grid h-9 w-9 place-items-center rounded-xl text-[var(--theme-text)]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <nav aria-label="Home menu" className="grid gap-1">
                <button type="button" onClick={() => { setSettingsMenuOpen(false); onNavigateToHistory(); }} className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-left font-bold hover:bg-[var(--theme-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]">
                  <History className="h-5 w-5 text-[var(--theme-primary)]" aria-hidden="true" />
                  <span>My transactions</span>
                </button>
                <button type="button" onClick={() => { setSettingsMenuOpen(false); onNavigateToCollection(); }} className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-left font-bold hover:bg-[var(--theme-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]">
                  <Award className="h-5 w-5 text-[var(--theme-primary)]" aria-hidden="true" />
                  <span>My collections</span>
                </button>
                <button type="button" onClick={() => { setSettingsMenuOpen(false); onSignOut(); }} className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-left font-bold text-rose-500 hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                  <LogOut className="h-5 w-5" aria-hidden="true" />
                  <span>Sign out</span>
                </button>
              </nav>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {homeGiftCodeOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.24, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 sm:p-5"
            onClick={() => setHomeGiftCodeOpen(false)}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="home-gift-code-title"
              onClick={(event) => event.stopPropagation()}
              initial={{ opacity: 0, x: prefersReducedMotion ? 0 : "100vw" }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: prefersReducedMotion ? 0 : "100vw" }}
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.3, ease: [0.32, 0.72, 0, 1] }}
              className="relative w-full max-w-md overflow-hidden rounded-[30px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] text-[var(--theme-text)] shadow-2xl"
            >
              <button
                type="button"
                aria-label="Close gift codes"
                onClick={() => setHomeGiftCodeOpen(false)}
                className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-[var(--theme-card-bg)]/70 text-[var(--theme-text)] opacity-75 backdrop-blur-md hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="relative flex min-h-40 items-center gap-4 overflow-hidden bg-gradient-to-br from-[var(--theme-primary)]/20 via-[var(--theme-card-bg)] to-[var(--theme-accent)]/10 px-5 py-5 pr-16 sm:px-6">
                <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-[var(--theme-primary)]/15 blur-3xl" />
                <div className="relative z-10 min-w-0 flex-1">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--theme-primary)]">Dragon treasure</p>
                  <h2 id="home-gift-code-title" className="font-display text-2xl font-black leading-tight">A gift for your hoard</h2>
                  <p className="mt-1.5 max-w-[16rem] text-sm leading-relaxed opacity-70">Redeem a code and send its reward straight to your balance.</p>
                </div>
                <img src={egg} alt="" className="relative z-10 h-20 w-20 shrink-0 object-contain drop-shadow-xl sm:h-24 sm:w-24" />
              </div>
              <form onSubmit={handleHomeGiftCodeRedeem} className="space-y-4 p-5 sm:p-6">
                <div className="space-y-2">
                  <label htmlFor="home-gift-code-input" className="block text-sm font-bold">Gift code</label>
                  <div className="relative">
                    <Gift className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--theme-primary)]" aria-hidden="true" />
                    <input
                      ref={homeGiftCodeInputRef}
                      id="home-gift-code-input"
                      type="text"
                      required
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      value={giftCodeValue}
                      onChange={(event) => setGiftCodeValue(event.target.value.toUpperCase())}
                      placeholder="Enter your code"
                      className="w-full rounded-2xl border border-[var(--theme-card-border)] bg-[var(--theme-bg)] py-3.5 pl-12 pr-4 text-left font-sans text-base font-bold tracking-[0.12em] outline-none placeholder:font-medium placeholder:tracking-normal placeholder:opacity-45 focus:border-[var(--theme-primary)] focus:ring-2 focus:ring-[var(--theme-primary)]/15"
                    />
                  </div>
                 
                </div>
                <button
                  type="submit"
                  disabled={!giftCodeValue.trim() || isRedeemingGiftCode}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--theme-primary)] px-4 font-sans text-sm font-black text-[var(--theme-on-primary)] shadow-lg shadow-[var(--theme-primary)]/20 transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isRedeemingGiftCode ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Gift className="h-4 w-4" aria-hidden="true" />}
                  {isRedeemingGiftCode ? "Redeeming…" : "Redeem gift code"}
                </button>
              </form>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <section aria-label="Dragon collection progress and daily income" className="grid min-h-[130px] grid-cols-2 gap-4 rounded-[24px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)]/65 p-4">
        <div className="min-w-0">
          <p className="text-[14px] text-[var(--theme-text)] opacity-65">Dragons hatched</p>
          <p aria-label={`${hatchedCount} dragons hatched out of ${eggs.length}`} className="mt-2 flex items-baseline gap-1.5 font-display leading-none tabular-nums text-[var(--theme-text)]">
            <span className="text-[32px] font-black sm:text-[36px]">{hatchedCount}</span>
            <span className="text-[15px] font-bold opacity-45 sm:text-[17px]">/ {eggs.length}</span>
          </p>
        </div>
        <div className="min-w-0 text-right px-1">
          <p className="text-[14px] text-[var(--theme-text)] opacity-65">Daily income</p>
          <p className="mt-2 inline-flex max-w-full items-baseline justify-end gap-1.5 truncate leading-none tabular-nums">
            <span className="font-sans text-[11px] font-bold tracking-wide text-[var(--theme-text)] opacity-55">UGX</span>
            <span className="truncate font-display text-[28px] font-black text-[var(--theme-primary)] sm:text-[32px]">
              {formatWholeUgx(dailyIncome)}
            </span>
          </p>
        </div>
      </section>

      <section aria-label="Eggs available to hatch" className="space-y-3">
        {eggs.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {eggs.map((egg, index) => {
              const soldOut = egg.outOfStock;
              const latestNode = latestNodes.get(egg.id);
              const ownedNode = isNodeInCycle(latestNode) ? latestNode : undefined;
              const completedNode = latestNode && !ownedNode && collectiblesLoaded
                && collectibles.some((collectible) => collectible.subscriptionId === latestNode.id && !collectible.claimedAt)
                ? latestNode
                : undefined;
              const dragonOwned = Boolean(ownedNode);
              const hatchCount = hatchCounts.get(egg.id) || 0;
              const isHatching = hatchingEggId === egg.id;
              const claimable = ownedNode ? getRunClaimableReturns(ownedNode, new Date(nowMs)) : null;
              const endMs = ownedNode ? getRunEndMs(ownedNode) : null;
              const daysLeft = endMs === null ? null : Math.max(0, Math.ceil((endMs - nowMs) / (24 * 60 * 60 * 1000)));
              const cycleFinished = ownedNode
                ? String(ownedNode.status).toLowerCase() !== "active" || endMs !== null && nowMs >= endMs
                : false;
              const dailyPercent = ownedNode && claimable && Number(ownedNode.dailyYield) > 0
                ? Math.max(0, (claimable.amount / Number(ownedNode.dailyYield)) * 100)
                : null;
              return (
                <article key={egg.id} className="overflow-hidden rounded-[24px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)]/75">
                  <div className={`relative flex aspect-[1.08] items-center justify-center overflow-hidden p-5 ${dragonOwned ? "bg-[var(--theme-primary)]/8" : "bg-[var(--theme-primary)]/6"}`}>
                    <img
                      src={isHatching ? egg.eggImageUrl : dragonOwned ? ownedNode.dragonImageUrl : egg.eggImageUrl}
                      alt={isHatching ? `${egg.name} egg hatching` : dragonOwned ? `${egg.name} dragon` : egg.name}
                      loading="lazy"
                      className={`${isHatching
                        ? "h-full w-full object-contain dragon-egg-hatching"
                        : dragonOwned
                          ? `h-full w-full object-contain${revealingDragonId === egg.id ? " dragon-hatch-reveal" : ""}`
                          : "h-full w-full object-contain dragon-egg-float"}`}
                      style={dragonOwned || isHatching ? undefined : { animationDelay: `${(index % 5) * -0.65}s` }}
                    />
                    <span className="absolute left-3 top-3 rounded-full bg-[var(--theme-bg)]/85 px-2.5 py-1 text-[14px] font-bold text-[var(--theme-text)]">
                      {egg.category}
                    </span>
                    {hatchCount > 0 && !dragonOwned ? (
                      <span className="absolute left-3 top-11 rounded-full bg-[var(--theme-bg)]/85 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[var(--theme-text)]">
                        Hatched ×{hatchCount}
                      </span>
                    ) : null}
                    {dragonOwned && !isHatching && dailyPercent !== null ? (
                      <span className="absolute right-3 top-3 rounded-full bg-[var(--theme-bg)]/85 px-2.5 py-1 text-[14px] font-black tabular-nums text-[var(--theme-text)]">
                        {Math.round(dailyPercent)}%
                      </span>
                    ) : null}
                    {!dragonOwned && soldOut ? (
                      <span className="absolute bottom-3 right-3 rounded-full bg-[var(--theme-bg)]/85 px-2.5 py-1 text-[14px] font-black text-[var(--theme-text)]">SOLD OUT</span>
                    ) : null}
                    {dragonOwned ? (
                      <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2 text-[14px] font-semibold">
                        <span className="text-[var(--theme-text)]">{isHatching ? "Your dragon is hatching" : "Dragon hatched"}</span>
                        {!isHatching ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-800">
                            <Check className="h-3 w-3" aria-hidden="true" /> In your valley
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-[19px] font-black text-[var(--theme-text)] sm:text-[21px]">{egg.name}</h3>
                        <p className="mt-0.5 text-[12px] font-sans font-semibold uppercase tracking-[0.12em] text-[var(--theme-text)] opacity-55">
                          {dragonOwned ? cycleFinished ? "Hatch cycle complete" : "Your dragon" : `${egg.duration} day${egg.duration === 1 ? "" : "s"} to hatch`}
                        </p>
                      </div>
                      {dragonOwned && daysLeft !== null ? (
                        <span className="shrink-0 rounded-full bg-[var(--theme-primary)]/10 px-2.5 py-1 text-right text-[11px] font-sans font-bold text-[var(--theme-primary)]">
                          {daysLeft} {daysLeft === 1 ? "day" : "days"} left
                        </span>
                      ) : !dragonOwned ? (
                        <p className="shrink-0 font-display text-[20px] font-black tabular-nums text-[var(--theme-primary)] sm:text-[22px]">{formatCurrency(egg.amount)}</p>
                      ) : null}
                    </div>
                    {dragonOwned && ownedNode && claimable ? (
                      <>
                        <div className="flex items-end justify-between gap-2 border-b border-[var(--theme-card-border)] pb-3">
                          <div>
                            <p className="text-[12px] text-[var(--theme-text)] opacity-65">Earned on this card</p>
                            <p className="mt-0.5 leading-none tabular-nums">
                              <AnimatedUgxAmount amount={claimable.amount} />
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between border-b border-[var(--theme-card-border)] py-3 text-[12px] sm:text-[13px]">
                          <span className="inline-flex items-center gap-1.5 text-[var(--theme-text)] opacity-70">
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Income per day
                          </span>
                          <span className="font-display text-[17px] font-black tabular-nums text-[var(--theme-primary)]">{formatCurrency(ownedNode.dailyYield)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleClaimIncome(ownedNode)}
                          disabled={claimingNodeId === ownedNode.id}
                          aria-label={cycleFinished
                            ? "Collect remaining accrued income."
                            : `Collect income. At least half of ${formatCurrency(ownedNode.dailyYield)} must accrue first.`}
                          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--theme-primary)] px-4 py-3 text-[14px] font-sans font-black text-[var(--theme-on-primary)] transition-transform duration-200 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-100"
                        >
                          {claimingNodeId === ownedNode.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                          Collect income
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between border-t border-[var(--theme-card-border)] pt-3 text-[12px] sm:text-[13px]">
                          <span className="text-[var(--theme-text)] opacity-65">Daily income</span>
                          <span className="font-display font-black tabular-nums text-[var(--theme-text)]">{formatCurrency(egg.dailyYield)}</span>
                        </div>
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => setConfirmingEgg(egg)}
                            disabled={!!soldOut || openingEggId === egg.id}
                            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[var(--theme-primary)]/20 bg-[var(--theme-primary)]/10 px-4 py-3 text-[14px] font-sans font-black text-[var(--theme-primary)] transition-transform duration-200 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Egg className="h-4 w-4" aria-hidden="true" /> Open egg <ArrowRight className="h-4 w-4" aria-hidden="true" />
                          </button>
                          {completedNode ? (
                            <button
                              type="button"
                              onClick={() => void handleCollectDragon(completedNode)}
                              disabled={claimingNodeId === completedNode.id}
                              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--theme-primary)] px-4 py-3 text-[14px] font-sans font-black text-[var(--theme-on-primary)] transition-transform duration-200 hover:scale-[1.01] disabled:opacity-60"
                            >
                              {claimingNodeId === completedNode.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" aria-hidden="true" />}
                              Collect dragon
                            </button>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[20px] border border-dashed border-[var(--theme-card-border)] px-5 py-8 text-center">
            <Egg className="mx-auto h-7 w-7 text-[var(--theme-primary)]" aria-hidden="true" />
            <p className="mt-2 font-display text-[15px] font-black text-[var(--theme-text)]">The nest is waiting</p>
            <p className="mx-auto mt-1 max-w-[26rem] text-[12px] leading-relaxed text-[var(--theme-text)] opacity-60">
              {enabledProductCount > 0
                ? `${enabledProductCount} store product${enabledProductCount === 1 ? "" : "s"} found, but none have both egg and dragon artwork yet. Update them in Admin or re-import with “Egg Image URL (PNG)” and “Dragon Image URL (SVG)” columns.`
                : "Egg products with both egg and dragon artwork will appear here when they are added to the store."}
            </p>
          </div>
        )}
      </section>

      {confirmingEgg ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-5 backdrop-blur-sm" onClick={() => openingEggId || setConfirmingEgg(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="egg-confirm-title"
            className="w-full max-w-sm overflow-hidden rounded-[28px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)] p-5 text-[var(--theme-text)] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[14px] font-black uppercase tracking-[0.18em] text-[var(--theme-primary)]">Hatching</p>
            <h2 id="egg-confirm-title" className="mt-2 font-display text-[25px] font-black leading-tight">{confirmingEgg.name}</h2>
            <p className="mt-2 text-[14px] leading-relaxed opacity-75">
              Hatch for {formatCurrency(confirmingEgg.amount)}. Your dragon appears in your valley immediately. It earns income for {confirmingEgg.duration} day{confirmingEgg.duration === 1 ? "" : "s"}, which you can collect separately as it accrues.
            </p>
            <p className="mt-3 flex items-center gap-2 text-[12px] font-bold text-[var(--theme-primary)]">
              <Check className="h-4 w-4" aria-hidden="true" />
              Balance after hatch: {formatCurrency((Number(profile.points) || 0) - confirmingEgg.amount)}
            </p>
            {(Number(profile.points) || 0) < confirmingEgg.amount ? (
              <p className="mt-3 text-[12px] font-semibold text-rose-700">Your account balance is too low to open this egg.</p>
            ) : null}
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setConfirmingEgg(null)} disabled={!!openingEggId} className="min-h-11 flex-1 rounded-full bg-[var(--theme-card-bg)] px-4 py-3 text-[13px] font-bold disabled:opacity-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleOpenEgg()}
                disabled={!!openingEggId || (Number(profile.points) || 0) < confirmingEgg.amount}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--theme-primary)] px-4 py-3 text-[13px] font-black text-[var(--theme-on-primary)] disabled:opacity-50"
              >
                {openingEggId === confirmingEgg.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Hatch for {formatCurrency(confirmingEgg.amount)}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
