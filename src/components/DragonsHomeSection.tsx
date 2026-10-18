import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Award, Check, Clock, Egg, ExternalLink, Gift, Loader2, LogOut, Timer, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import { useGatedInterval } from "../hooks/useGatedInterval";
import type { Collectible, SiteConfig, SubscribedNode, SubscriptionItem, UserProfile } from "../types";
import { readApiJson } from "../utils/api";
import { formatClock, getNextFeedingMessage, getRunClaimableReturns, getRunEndMs, getRunMinimumClaimAmount, getRunTotalDays, msUntilPlatformMidnight } from "../utils/runs";
import { isDragonEggProduct } from "../utils/dragons";
import { usePwaInstall } from "../hooks/usePwaInstall";
import { celebrateFeed } from "../utils/feedCelebration";

import egg from "@/src/assets/svg/celestial.png";
import clockSvg from "@/src/assets/svg/clock.svg";
import corn from "@/src/assets/svg/corn.svg";
import priceTag from "@/src/assets/svg/price-tag.svg";
import barnMenuIcon from "@/src/assets/svg/barn-menu.svg";
import tractor from "@/src/assets/svg/tractor.svg";
import transactionsIcon from "@/src/assets/svg/transactions.svg";
import giftCodeIcon from "@/src/assets/svg/giftcode.svg";
import accountDetailsIcon from "@/src/assets/svg/profile.svg";
import downloadAppIcon from "@/src/assets/svg/download.svg";
import communityIcon from "@/src/assets/svg/community.svg";
import depositIcon from "@/src/assets/svg/deposit.svg";
import withdrawIcon from "@/src/assets/svg/withdraw.svg";
import { playCheckinSound, primeCheckinSound } from "../utils/checkinSound";

type CoinFlight = { id: number; startX: number; startY: number; dx: number; dy: number; delay: number };
const CLAIM_SUCCESS_TOAST_DELAY_MS = 1800;
type Props = {
  isActive: boolean;
  profile: UserProfile;
  activeNodes: SubscribedNode[];
  items: SubscriptionItem[];
  siteConfig?: SiteConfig | null;
  onSubscribeSuccess: (node: SubscribedNode, amount: number) => void;
  onClaimSuccess: (amount: number, balance: number, subId: string, lastClaimedDate: string, status: "active" | "expired", withdrawableBalance?: number, daysFed?: number) => void;
  onProfileUpdate: (profile: UserProfile) => void;
  onNavigateToCollection: () => void;
  onNavigateToHistory: () => void;
  onNavigateToAccount: () => void;
  onNavigateToDeposit: () => void;
  onNavigateToWithdraw: () => void;
  onSignOut: () => void;
};

function formatWholeUgx(amount: number): string {
  return Math.max(0, Math.floor(Number(amount) || 0)).toLocaleString("en-UG", { maximumFractionDigits: 0 });
}

export default function DragonsHomeSection({
  isActive,
  profile,
  activeNodes,
  items,
  siteConfig,
  onSubscribeSuccess,
  onClaimSuccess,
  onProfileUpdate,
  onNavigateToCollection,
  onNavigateToHistory,
  onNavigateToAccount,
  onNavigateToDeposit,
  onNavigateToWithdraw,
  onSignOut,
}: Props) {
  const { formatCurrency } = useCurrency();
  const prefersReducedMotion = useReducedMotion();
  const { canInstall, isInstalled, install } = usePwaInstall();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [confirmingEgg, setConfirmingEgg] = useState<SubscriptionItem | null>(null);
  const [openingEggId, setOpeningEggId] = useState<string | null>(null);
  const [hatchingEggId, setHatchingEggId] = useState<string | null>(null);
  const [revealingDragonId, setRevealingDragonId] = useState<string | null>(null);
  const [claimingNodeId, setClaimingNodeId] = useState<string | null>(null);
  const [isFeedingAll, setIsFeedingAll] = useState(false);
  const [coinFlights, setCoinFlights] = useState<CoinFlight[]>([]);
  const [shakingItemIds, setShakingItemIds] = useState<string[]>([]);
  const [collectibles, setCollectibles] = useState<Collectible[]>([]);
  const [collectiblesLoaded, setCollectiblesLoaded] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const [homeGiftCodeOpen, setHomeGiftCodeOpen] = useState(false);
  const [giftCodeValue, setGiftCodeValue] = useState("");
  const [isRedeemingGiftCode, setIsRedeemingGiftCode] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const closeSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const homeGiftCodeInputRef = useRef<HTMLInputElement>(null);
  const communityChannels = [
    { label: "WhatsApp community", href: siteConfig?.whatsappLink, icon: "/whatsapp.svg" },
    { label: "Telegram community", href: siteConfig?.telegramLink, icon: "/telegram.svg" },
  ].filter((channel): channel is { label: string; href: string; icon: string } => Boolean(channel.href?.trim()));

  const handleDownloadApp = async () => {
    setSettingsMenuOpen(false);
    if (isInstalled) {
      toast.info("App is already installed on this device.");
      return;
    }
    if (canInstall) {
      if (!(await install())) toast.info("Installation was cancelled.");
      return;
    }
    toast.info("Use your browser menu and choose Install app or Add to Home screen.");
  };

  const triggerCardShake = (itemIds: string[]) => {
    setShakingItemIds(itemIds);
    window.setTimeout(() => setShakingItemIds([]), 900);
  };

  const animateCoinsToBalance = (sourceRect: DOMRect, count = 9) => {
    if (prefersReducedMotion) return;
    const target = document.querySelector<HTMLElement>(".user-app-balance")?.getBoundingClientRect();
    if (!target) return;
    const startX = sourceRect.left + sourceRect.width / 2;
    const startY = sourceRect.top + sourceRect.height / 2;
    const dx = target.left + target.width / 2 - startX;
    const dy = target.top + target.height / 2 - startY;
    const now = Date.now();
    setCoinFlights(Array.from({ length: count }, (_, index) => ({
      id: now + index,
      startX: startX + (Math.random() - 0.5) * 26,
      startY: startY + (Math.random() - 0.5) * 16,
      dx: dx + (Math.random() - 0.5) * 28,
      dy: dy + (Math.random() - 0.5) * 18,
      delay: index * 0.045,
    })));
    window.setTimeout(() => setCoinFlights([]), 1150);
  };

  const celebrateFeeding = (sourceRects: DOMRect[], feedAll = false) => {
    playCheckinSound();
    if (sourceRects.length === 0 || prefersReducedMotion) return;
    celebrateFeed(sourceRects, feedAll);
  };

  const toastAfterClaimAnimation = (message: string) => {
    window.setTimeout(() => toast.success(message), prefersReducedMotion ? 0 : CLAIM_SUCCESS_TOAST_DELAY_MS);
  };

  const matureChickenAfterFeed = (node: SubscribedNode, nextDaysFed: number) => {
    const midpointFeed = Math.ceil(getRunTotalDays(node, items) / 2);
    if (Number(node.daysFed || 0) >= midpointFeed || nextDaysFed < midpointFeed) return;
    setRevealingDragonId(node.itemId);
    window.setTimeout(() => setRevealingDragonId((current) => current === node.itemId ? null : current), 900);
  };

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
      onProfileUpdate({
        ...profile,
        points: (Number(profile.points) || 0) + amount,
        withdrawableBalance: (Number(profile.withdrawableBalance) || 0) + amount,
      });
      const submitButton = document.getElementById("home-gift-code-submit");
      if (submitButton) animateCoinsToBalance(submitButton.getBoundingClientRect(), 12);
      toastAfterClaimAnimation(`Redeemed gift code of ${formatCurrency(amount)}.`);
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
    primeCheckinSound();
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
      playCheckinSound();
      setHatchingEggId(egg.id);
      const hatchDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 2200;
      await new Promise((resolve) => window.setTimeout(resolve, hatchDuration));
      setRevealingDragonId(egg.id);
      window.setTimeout(() => setRevealingDragonId((current) => current === egg.id ? null : current), 900);
      toast.success(`${egg.name} hatched! Your chick is now in your flock.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The egg could not be opened.");
    } finally {
      setOpeningEggId(null);
      setHatchingEggId(null);
    }
  };

  const handleClaimIncome = async (node: SubscribedNode, sourceRect: DOMRect) => {
    const now = new Date();
    const accrued = getRunClaimableReturns(node, now).amount;
    const nodeEndMs = getRunEndMs(node);
    const cycleFinished = String(node.status).toLowerCase() !== "active" || nodeEndMs !== null && now.getTime() >= nodeEndMs;
    const minimumClaimAmount = getRunMinimumClaimAmount(node);
    if (accrued < minimumClaimAmount) {
      toast.info(minimumClaimAmount > 0
        ? getNextFeedingMessage()
        : "This chicken is not configured to earn income.");
      return;
    }
    if (cycleFinished && accrued <= 0) {
      toast.error("There is no accrued income left to collect.");
      return;
    }

    primeCheckinSound();
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
        updatedWithdrawableBalance: number;
        lastClaimedDate: string;
        status: "active" | "expired";
        itemName: string;
        daysFed: number;
      }>(response);
      if (!data.success) throw new Error("Income could not be collected. Please try again.");
      onClaimSuccess(data.pointsClaimed, data.updatedPoints, node.id, data.lastClaimedDate, data.status, data.updatedWithdrawableBalance, data.daysFed);
      matureChickenAfterFeed(node, data.daysFed);
      triggerCardShake([node.itemId]);
      celebrateFeeding([sourceRect]);
      toastAfterClaimAnimation(`${formatCurrency(data.pointsClaimed)} fed to your hen from ${data.itemName}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Income could not be collected.");
    } finally {
      setClaimingNodeId(null);
    }
  };

  const handleFeedAll = async (sourceRect: DOMRect) => {
    if (isFeedingAll || claimingNodeId) return;
    const ready = activeNodes.filter((node) => {
      if (!node.eggImageUrl || !node.dragonImageUrl) return false;
      return getRunClaimableReturns(node, new Date()).amount >= getRunMinimumClaimAmount(node)
        && getRunMinimumClaimAmount(node) > 0;
    });
    if (!ready.length) {
      toast.error("Your chickens have all been fed today. Come back tomorrow.");
      return;
    }

    primeCheckinSound();
    setIsFeedingAll(true);
    try {
      const results = await Promise.allSettled(ready.map(async (node) => {
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
          updatedWithdrawableBalance: number;
          lastClaimedDate: string;
          status: "active" | "expired";
          itemName: string;
          daysFed: number;
        }>(response);
        if (!data.success) throw new Error("Income could not be collected.");
        onClaimSuccess(data.pointsClaimed, data.updatedPoints, node.id, data.lastClaimedDate, data.status, data.updatedWithdrawableBalance, data.daysFed);
        matureChickenAfterFeed(node, data.daysFed);
        return { itemId: node.itemId, amount: Number(data.pointsClaimed) || 0 };
      }));
      const successfulClaims = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const collected = successfulClaims.reduce((sum, result) => sum + result.amount, 0);
      const failures = results.filter((result) => result.status === "rejected").length;
      if (collected > 0) {
        const successfulItemIds = successfulClaims.map((claim) => claim.itemId);
        triggerCardShake(successfulItemIds);
        const readyItemIds = new Set(successfulItemIds);
        const cardRects = Array.from(document.querySelectorAll<HTMLElement>("[data-feed-card-item]"))
          .filter((card) => {
            const rect = card.getBoundingClientRect();
            return readyItemIds.has(card.dataset.feedCardItem || "") && rect.bottom > 0 && rect.top < window.innerHeight;
          })
          .map((card) => card.getBoundingClientRect());
        celebrateFeeding(cardRects.length ? cardRects : [sourceRect], true);
        toastAfterClaimAnimation(`${formatCurrency(collected)} fed to your hens.`);
      }
      if (failures > 0) toast.error("Some chickens could not be fed. Please try again.");
    } finally {
      setIsFeedingAll(false);
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
      if (!data.success || !data.collectible) throw new Error("Hen could not be added to your collection. Please try again.");
      setCollectibles((current) => [
        ...current.filter((collectible) => collectible.subscriptionId !== node.id),
        data.collectible,
      ]);
      toast.success(`${data.collectible.itemName} added to your collection!`);
      onNavigateToCollection();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Hen could not be added to your collection.");
    } finally {
      setClaimingNodeId(null);
    }
  };

  return (
    <section className="space-y-5">
      {coinFlights.length > 0 && typeof document !== "undefined" ? createPortal(
        <AnimatePresence>
          <div className="pointer-events-none fixed inset-0 z-[120] overflow-hidden" aria-hidden="true">
            {coinFlights.map((coin) => (
              <motion.img
                key={coin.id}
                src={corn}
                alt=""
                initial={{ x: 0, y: 0, scale: 0.8, rotate: 0, opacity: 1 }}
                animate={{ x: coin.dx, y: coin.dy, scale: 0.35, rotate: 360, opacity: 0.1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: prefersReducedMotion ? 0.01 : 0.72, delay: coin.delay, ease: [0.22, 1, 0.36, 1] }}
                className="absolute h-7 w-7 object-contain drop-shadow-md"
                style={{ left: coin.startX - 14, top: coin.startY - 14 }}
              />
            ))}
          </div>
        </AnimatePresence>,
        document.body
      ) : null}
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
          <span className="relative grid h-8 w-8 place-items-center">
            <img src={barnMenuIcon} alt="" aria-hidden="true" className="h-8 w-8 object-contain" />
            <span className="absolute -right-1 -top-0.5 flex h-3 w-3" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--theme-primary)] opacity-70 motion-reduce:animate-none" />
              <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-[var(--theme-card-bg)] bg-[var(--theme-primary)]" />
            </span>
          </span>
        </button>
      </div>

      <header className="space-y-1 justify-center text-left flex flex-col px-1">
        <div className="relative flex min-h-8 items-center justify-center px-10">
          <p className="text-[10px] font-sans font-black uppercase tracking-[0.18em] text-[var(--theme-primary)]">
            {profile.username?.trim() ? `${profile.username.trim()}’s chicken farm` : "Chicken farm"}
          </p>
        </div>
        <h1 className="max-w-[28rem] text-left font-display text-[18px] font-black leading-tight tracking-tight text-[var(--theme-text)]">
          Hatch eggs and watch your chicken grow as you earn!
        </h1>
      </header>

      <AnimatePresence>
        {settingsMenuOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.42, ease: [0.22, 1, 0.36, 1] }}
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
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.48, ease: [0.22, 1, 0.36, 1] }}
              className="max-h-[min(84dvh,40rem)] w-full max-w-md overflow-y-auto rounded-[30px] border-2 border-[var(--theme-accent)]/30 bg-[var(--theme-card-bg)] p-4 text-[var(--theme-text)] shadow-2xl sm:p-5"
            >
              <div className="relative mb-4 overflow-hidden rounded-[24px] border border-[var(--theme-primary)]/25 bg-[var(--theme-primary)]/10 px-4 py-3">
                <div className="pointer-events-none absolute -right-5 -top-8 h-28 w-28 rounded-full bg-[var(--theme-accent)]/15 blur-2xl" />
                <div className="relative flex items-center gap-3">
                  <img src={barnMenuIcon} alt="" aria-hidden="true" className="h-12 w-12 shrink-0 object-contain drop-shadow-md" />
                  <div className="min-w-0 flex-1">
   
                    <h2 id="home-settings-title" className="font-display text-xl font-black leading-tight">Farm menu</h2>
                    <p className="mt-0.5 text-xs font-semibold opacity-60">Choose an adventure</p>
                  </div>
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
              </div>
              <nav aria-label="Home menu" className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setSettingsMenuOpen(false); onNavigateToHistory(); }} className="group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-[20px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/70 px-2 py-3 text-center font-bold shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--theme-accent)]/60 hover:bg-[var(--theme-accent)]/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]">
                  <img src={transactionsIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain transition-transform group-hover:scale-105" />
                  <span>My transactions</span>
                </button>
                <button type="button" onClick={() => { setSettingsMenuOpen(false); onNavigateToCollection(); }} className="group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-[20px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/70 px-2 py-3 text-center font-bold shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--theme-accent)]/60 hover:bg-[var(--theme-accent)]/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]">
                  <img src={tractor} alt="" aria-hidden="true" className="h-10 w-10 object-contain transition-transform group-hover:scale-105" />
                  <span>My farm</span>
                </button>
                <button type="button" onClick={() => { setSettingsMenuOpen(false); onNavigateToAccount(); }} className="group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-[20px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/70 px-2 py-3 text-center font-bold shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--theme-accent)]/60 hover:bg-[var(--theme-accent)]/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]">
                  <img src={accountDetailsIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain transition-transform group-hover:scale-105" />
                  <span>Account details</span>
                </button>
                <button type="button" onClick={() => { setSettingsMenuOpen(false); onNavigateToDeposit(); }} className="group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-[20px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/70 px-2 py-3 text-center font-bold shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--theme-accent)]/60 hover:bg-[var(--theme-accent)]/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]">
                  <img src={depositIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain transition-transform group-hover:scale-105" />
                  <span>Top up</span>
                </button>
                <button type="button" onClick={() => { setSettingsMenuOpen(false); onNavigateToWithdraw(); }} className="group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-[20px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/70 px-2 py-3 text-center font-bold shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--theme-accent)]/60 hover:bg-[var(--theme-accent)]/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]">
                  <img src={withdrawIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain transition-transform group-hover:scale-105" />
                  <span>Withdraw</span>
                </button>
                <button type="button" onClick={() => { setSettingsMenuOpen(false); setCommunityOpen(true); }} className="group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-[20px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/70 px-2 py-3 text-center font-bold shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--theme-accent)]/60 hover:bg-[var(--theme-accent)]/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]">
                  <img src={communityIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain transition-transform group-hover:scale-105" />
                  <span>Community</span>
                </button>
                {!isInstalled ? (
                  <button type="button" onClick={() => void handleDownloadApp()} className="group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-[20px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/70 px-2 py-3 text-center font-bold shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--theme-accent)]/60 hover:bg-[var(--theme-accent)]/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]">
                    <img src={downloadAppIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain transition-transform group-hover:scale-105" />
                    <span>Download app</span>
                  </button>
                ) : null}
                <button type="button" onClick={() => { setSettingsMenuOpen(false); setHomeGiftCodeOpen(true); }} className="group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-[20px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/70 px-2 py-3 text-center font-bold shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--theme-accent)]/60 hover:bg-[var(--theme-accent)]/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]">
                  <img src={giftCodeIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain transition-transform group-hover:scale-105" />
                  <span>Gift code</span>
                </button>
                <button type="button" onClick={() => { setSettingsMenuOpen(false); onSignOut(); }} className="group col-span-2 flex min-h-14 items-center justify-center gap-3 rounded-[20px] border border-rose-500/20 bg-rose-500/5 px-3 text-center font-bold text-rose-500 transition-colors hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                  <LogOut className="h-8 w-8" aria-hidden="true" />
                  <span>Sign out</span>
                </button>
              </nav>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {communityOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 sm:p-5"
            onClick={() => setCommunityOpen(false)}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="community-title"
              initial={{ opacity: 0, x: prefersReducedMotion ? 0 : 32, scale: prefersReducedMotion ? 1 : 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: prefersReducedMotion ? 0 : 20, scale: prefersReducedMotion ? 1 : 0.98 }}
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.48, ease: [0.22, 1, 0.36, 1] }}
              onClick={(event) => event.stopPropagation()}
              className="relative flex max-h-[min(84dvh,36rem)] w-full max-w-md flex-col overflow-y-auto rounded-[30px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-5 text-[var(--theme-text)] shadow-2xl"
            >
              <div className="flex items-center justify-between gap-4 border-b border-[var(--theme-card-border)] pb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--theme-primary)]">Stay updated.</p>
                  <h2 id="community-title" className="mt-1 font-display text-xl font-black">Our community</h2>
                </div>
                <button type="button" onClick={() => setCommunityOpen(false)} aria-label="Close community" className="grid h-10 w-10 place-items-center rounded-xl hover:bg-[var(--theme-bg)]">
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-4 text-sm leading-relaxed opacity-70">Join the official channels for updates, support, and community rewards.</p>
              <div className="mt-5 grid gap-2">
                {communityChannels.map((channel) => (
                  <a key={channel.label} href={channel.href} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center gap-3 rounded-2xl border border-[var(--theme-card-border)] px-3 transition-colors hover:bg-[var(--theme-bg)]">
                    <img src={channel.icon} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
                    <span className="flex-1 font-bold">{channel.label}</span>
                    <ExternalLink className="h-4 w-4 opacity-50" aria-hidden="true" />
                  </a>
                ))}
                {communityChannels.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-[var(--theme-card-border)] px-4 py-6 text-sm leading-relaxed opacity-65">Community channels have not been configured yet.</p>
                ) : null}
              </div>
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
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 sm:p-5"
            onClick={() => setHomeGiftCodeOpen(false)}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="home-gift-code-title"
              onClick={(event) => event.stopPropagation()}
              initial={{ opacity: 0, x: prefersReducedMotion ? 0 : 32, scale: prefersReducedMotion ? 1 : 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: prefersReducedMotion ? 0 : 20, scale: prefersReducedMotion ? 1 : 0.98 }}
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.48, ease: [0.22, 1, 0.36, 1] }}
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

                  <h2 id="home-gift-code-title" className="font-display text-2xl font-black leading-tight">Treasure hunters</h2>
                  <p className="mt-1.5 max-w-[16rem] text-sm leading-relaxed opacity-70">Find voucher codes in our community spaces and redeem them here.</p>
                </div>
                <img src={egg} alt="" className="relative z-10 h-20 w-20 shrink-0 object-contain drop-shadow-xl sm:h-24 sm:w-24" />
              </div>
              <form onSubmit={handleHomeGiftCodeRedeem} className="space-y-4 p-5 sm:p-6">
                <div className="space-y-2">
    
                  <div className="relative">
 
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
                      className="w-full rounded-2xl border border-[var(--theme-card-border)] bg-[var(--theme-bg)] py-3.5 pl-12 pr-4 text-left font-sans text-base font-bold tracking-[0.12em] outline-none placeholder:font-medium  focus:border-[var(--theme-primary)] focus:ring-2 focus:ring-[var(--theme-primary)]/15"
                    />
                  </div>
                 
                </div>
                <button
                  id="home-gift-code-submit"
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

      <section aria-label="Chicken flock progress and daily income" className="grid min-h-[130px] grid-cols-2 gap-4 rounded-[24px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)]/65 p-4">
        <div className="min-w-0">
          <p className="text-[14px] text-[var(--theme-text)] opacity-65">Eggs hatched</p>
          <p aria-label={`${hatchedCount} chickens raised from ${eggs.length} eggs`} className="mt-2 flex items-baseline gap-1.5 font-display leading-none tabular-nums text-[var(--theme-text)]">
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

      {activeNodes.some((node) => node.eggImageUrl && node.dragonImageUrl && isNodeInCycle(node)) && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={(event) => void handleFeedAll(event.currentTarget.getBoundingClientRect())}
            disabled={isFeedingAll || !!claimingNodeId}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--theme-accent)]/45 bg-[var(--theme-accent)]/12 px-5 py-2.5 text-sm font-black text-[var(--theme-text)] transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {isFeedingAll ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : (
              <span className="inline-flex items-center -space-x-1" aria-hidden="true">
                {[0, 1, 2].map((cornIndex) => (
                  <img key={cornIndex} src={corn} alt="" className="h-5 w-5 object-contain" />
                ))}
              </span>
            )}
            Feed all
          </button>
        </div>
      )}

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
              const totalDays = ownedNode
                ? getRunTotalDays(ownedNode, items)
                : Math.max(1, Math.floor(Number(egg.duration) || 15));
              const daysFed = ownedNode ? Math.max(0, Math.floor(Number(ownedNode.daysFed) || 0)) : 0;
              const isMatureDragon = dragonOwned && daysFed >= Math.ceil(totalDays / 2);
              const activeDragonArtwork = ownedNode
                ? (isMatureDragon ? ownedNode.dragonImageUrl : ownedNode.youngDragonImageUrl || ownedNode.dragonImageUrl)
                : "";
              const currentCycleDay = Math.min(totalDays, daysFed + 1);
              const dailyIncomePercent = Number(egg.amount) > 0
                ? Math.max(0, Math.round((Number(egg.dailyYield) / Number(egg.amount)) * 100))
                : 0;
              const cycleProgress = ownedNode && totalDays > 0
                ? Math.min(100, Math.max(0, (daysFed / totalDays) * 100))
                : 0;
              const minimumClaimAmount = ownedNode ? getRunMinimumClaimAmount(ownedNode) : 0;
              const isFeedReady = Boolean(claimable && minimumClaimAmount > 0 && claimable.amount >= minimumClaimAmount);
              return (
                <article
                  key={egg.id}
                  data-feed-card-item={egg.id}
                  className={`feed-celebration-card overflow-hidden rounded-[20px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)]/75 ${shakingItemIds.includes(egg.id) ? "is-shaking" : ""}`}
                  style={{ "--feed-stagger": `${Math.min(index, 5) * 30}ms` } as React.CSSProperties}
                >
                  <div className={`relative flex aspect-[1.5] items-center justify-center overflow-hidden p-4 ${dragonOwned ? "bg-[var(--theme-primary)]/8" : "bg-[var(--theme-primary)]/6"}`}>
                    <img
                      src={isHatching ? egg.eggImageUrl : dragonOwned ? activeDragonArtwork : egg.eggImageUrl}
                      alt={isHatching ? `${egg.name} egg hatching` : dragonOwned ? `${egg.name} ${isMatureDragon ? "mature hen" : "young chicken"}` : egg.name}
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
                    <span className="absolute right-3 top-3 rounded-full bg-[var(--theme-bg)]/90 px-2.5 py-1 text-[11px] font-black text-[var(--theme-primary)] shadow-sm">
                      {dailyIncomePercent}% daily
                    </span>
                    {hatchCount > 0 && !dragonOwned ? (
                      <span className="absolute left-3 top-11 rounded-full bg-[var(--theme-bg)]/85 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[var(--theme-text)]">
                        Hatched ×{hatchCount}
                      </span>
                    ) : null}

                    {!dragonOwned && soldOut ? (
                      <span className="absolute bottom-3 right-3 rounded-full bg-[var(--theme-bg)]/85 px-2.5 py-1 text-[14px] font-black text-[var(--theme-text)]">SOLD OUT</span>
                    ) : null}

                  </div>
                  <div className="space-y-2.5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-[18px] font-black text-[var(--theme-text)] sm:text-[20px]">{egg.name}</h3>
                      </div>
                      {dragonOwned ? (
                        <p className="inline-flex shrink-0 items-center gap-1 font-display text-[17px] font-black tabular-nums text-[var(--theme-text)]">
                          <img src={priceTag} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
                          {formatCurrency(egg.amount)}
                        </p>
                      ) : (
                        <div className="flex shrink-0 items-end">
                          <p className="inline-flex items-center gap-1 font-display text-[20px] font-black tabular-nums text-[var(--theme-text)] sm:text-[22px]">
                            <img src={priceTag} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
                            {formatCurrency(egg.amount)}
                          </p>
                        </div>
                      )}
                    </div>
                    {dragonOwned && ownedNode && claimable ? (
                      <>
                        <div className="flex items-center justify-between text-[14px]">
                          <span className="inline-flex items-center gap-1.5 text-[var(--theme-text)] opacity-70">
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Income per day
                          </span>
                          <span className="font-display text-[17px] font-black tabular-nums text-[var(--theme-primary)]">{formatCurrency(ownedNode.dailyYield)}</span>
                        </div>
                        <div className={`feed-cycle-progress space-y-2 ${isFeedReady ? "is-ready" : ""}`} aria-label={`Cycle progress: day ${currentCycleDay} of ${totalDays}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              {minimumClaimAmount > 0 && claimable.amount === 0 ? (
                                <p className="text-left text-[12px] font-medium tabular-nums text-[var(--theme-primary)] opacity-90">
                                  Next feeding in {formatClock(msUntilPlatformMidnight(nowMs))}
                                </p>
                              ) : null}
                            </div>
                            <span
                              aria-label={`Cycle day ${currentCycleDay} of ${totalDays}`}
                              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--theme-primary)]/10 px-2.5 py-1 text-[10px] font-sans font-bold tabular-nums text-[var(--theme-primary)]"
                            >
                              <img src={clockSvg} alt="" aria-hidden="true" className="h-3.5 w-3.5" />
                              Day {currentCycleDay}/{totalDays}
                            </span>
                          </div>
                          <div
                            role="progressbar"
                            aria-label="Chicken cycle progress"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(cycleProgress)}
                            className="feed-corn-rail"
                          >
                            <div className="feed-corn-fill" style={{ width: `${cycleProgress}%` }}>
                              {Array.from({ length: 10 }, (_, kernelIndex) => (
                                <img key={kernelIndex} src={corn} alt="" aria-hidden="true" />
                              ))}
                            </div>
                            <img
                              src={corn}
                              alt=""
                              aria-hidden="true"
                              className={`feed-next-kernel ${isFeedReady ? "is-ready" : ""}`}
                              style={{ left: `${Math.min(96, Math.max(4, cycleProgress))}%` }}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            const card = event.currentTarget.closest<HTMLElement>("[data-feed-card-item]");
                            void handleClaimIncome(ownedNode, card?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect());
                          }}
                          disabled={claimingNodeId === ownedNode.id || isFeedingAll}
                          aria-disabled={!isFeedReady}
                          aria-label={isFeedReady
                            ? "Feed chick. Today's income is ready to collect."
                            : "Feed chick. Tap to see when it can be fed again."}
                          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--theme-accent)]/45 bg-[var(--theme-accent)]/12 px-5 py-2.5 text-[13px] font-black text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-accent)]/20 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
                        >
                          {claimingNodeId === ownedNode.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <img src={corn} alt="" className="h-5 w-5 object-contain" />}
                          Feed chick
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-[14px] sm:text-[13px]">
                          <span className="text-[var(--theme-text)] opacity-65">Income per day</span>
                          <span className="font-display font-black tabular-nums text-[var(--theme-text)]">{formatCurrency(egg.dailyYield)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[13px]">
                          <span className="text-[var(--theme-text)] opacity-65">Duration</span>
                          <span
                            aria-label={`${totalDays} day${totalDays === 1 ? "" : "s"} duration`}
                            className="inline-flex items-center gap-1 rounded-full bg-[var(--theme-primary)]/10 px-2.5 py-1 text-[10px] font-sans font-bold tabular-nums text-[var(--theme-primary)]"
                          >
                            <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                            {totalDays} {totalDays === 1 ? "day" : "days"}
                          </span>
                        </div>
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => setConfirmingEgg(egg)}
                            disabled={!!soldOut || openingEggId === egg.id}
                            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-[var(--theme-primary)]/20 bg-[var(--theme-primary)]/10 px-4 py-3 text-[14px] font-sans font-black text-[var(--theme-primary)] transition-transform duration-200 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
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
                              Collect hen
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
            <p className="mt-2 font-display text-[15px] font-black text-[var(--theme-text)]">The farm is empty at the moment</p>
            <p className="mx-auto mt-1 max-w-[26rem] text-[14px] leading-relaxed text-[var(--theme-text)] opacity-60">
              {enabledProductCount > 0
                ? `${enabledProductCount} store product${enabledProductCount === 1 ? "" : "s"} found, but egg and mature chicken are not configured yet. Add egg, young chicken, and mature chicken artwork in Admin.`
                : "Egg products with egg and chicken artwork will appear here when they are added to the store."}
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
                  Feed your chick once per day to earn daily income; Each feed advances its {confirmingEgg.duration}-day cycle.
            </p>
            <p className="mt-3 flex items-center gap-2 text-[14px] font-bold text-[var(--theme-primary)]">
              <Check className="h-4 w-4" aria-hidden="true" />
              My capital after hatch: {formatCurrency((Number(profile.rechargeableBalance) || 0) - confirmingEgg.amount)}
            </p>
            {(Number(profile.rechargeableBalance) || 0) < confirmingEgg.amount ? (
              <p className="mt-3 text-[14px] font-semibold text-rose-700">Your capital is too low to open this egg.</p>
            ) : null}
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setConfirmingEgg(null)} disabled={!!openingEggId} className="min-h-11 flex-1 rounded-full bg-[var(--theme-card-bg)] px-4 py-3 text-[13px] font-bold disabled:opacity-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleOpenEgg()}
                disabled={!!openingEggId || (Number(profile.rechargeableBalance) || 0) < confirmingEgg.amount}
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
