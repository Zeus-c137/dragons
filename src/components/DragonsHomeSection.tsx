import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Award, Check, ChevronRight, Clock, Egg, ExternalLink, Gift, Loader2, LogOut, Timer, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import { useGatedInterval } from "../hooks/useGatedInterval";
import type { Collectible, SiteConfig, SubscribedNode, SubscriptionItem, UserProfile } from "../types";
import { readApiJson } from "../utils/api";
import { getRunEndMs, getRunMinimumClaimAmount, isRunCycleFinished } from "../utils/runs";
import { isDragonEggProduct } from "../utils/dragons";
import { getMonthlyGenesisArt } from "../utils/monthlyGenesisArt";
import { usePwaInstall } from "../hooks/usePwaInstall";
import GenesisEggCard from "./GenesisEggCard";

import egg from "@/src/assets/svg/celestial.png";
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
const CLAIM_SUCCESS_TOAST_DELAY_MS = 1500;
type Props = {
  isActive: boolean;
  navCompact?: boolean;
  profile: UserProfile;
  activeNodes: SubscribedNode[];
  items: SubscriptionItem[];
  siteConfig?: SiteConfig | null;
  onSubscribeSuccess: (node: SubscribedNode, amount: number) => void;
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
  navCompact = false,
  profile,
  activeNodes,
  items,
  siteConfig,
  onSubscribeSuccess,
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
  const [coinFlights, setCoinFlights] = useState<CoinFlight[]>([]);
  const [confirmingEgg, setConfirmingEgg] = useState<SubscriptionItem | null>(null);
  // Hatch plays inside this modal: "hatching" cracks the egg open, "hatched"
  // shows the chick plus the go-feed-it message; OK then routes to My Chicks,
  // where the daily feeding is always a manual tap.
  const [hatchStage, setHatchStage] = useState<"idle" | "hatching" | "hatched">("idle");
  const [collectibles, setCollectibles] = useState<Collectible[]>([]);
  const [collectiblesLoaded, setCollectiblesLoaded] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const [homeGiftCodeOpen, setHomeGiftCodeOpen] = useState(false);
  const [giftCodeValue, setGiftCodeValue] = useState("");
  const [isRedeemingGiftCode, setIsRedeemingGiftCode] = useState(false);
  const [isGiftEggBursting, setIsGiftEggBursting] = useState(false);
  const [availableGiftCodes, setAvailableGiftCodes] = useState<{ count: number; amount: number }>({ count: 0, amount: 0 });
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const closeSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const homeGiftCodeInputRef = useRef<HTMLInputElement>(null);
  const homeGiftCodeEggRef = useRef<HTMLImageElement>(null);
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

  // Coin-flight + delayed toast remain here for the gift-code redemption reward on home.
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

  const toastAfterClaimAnimation = (message: string) => {
    window.setTimeout(() => toast.success(message), CLAIM_SUCCESS_TOAST_DELAY_MS);
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

  const refreshAvailableGiftCodes = async () => {
    try {
      const response = await fetch(`/api/user/gift_codes/available/${encodeURIComponent(profile.id)}`, {
        credentials: "same-origin",
      });
      if (!response.ok) return;
      const data = await readApiJson<{ count?: number; amount?: number }>(response);
      setAvailableGiftCodes({
        count: Math.max(0, Number(data.count) || 0),
        amount: Math.max(0, Number(data.amount) || 0),
      });
    } catch {
      // Availability is only a hint; never block redemption on this check.
    }
  };

  useEffect(() => {
    if (!isActive) return;
    void refreshAvailableGiftCodes();
  }, [isActive, profile.id]);

  useGatedInterval(() => {
    void refreshAvailableGiftCodes();
  }, 60_000, { enabled: isActive, visibilityGate: true, runOnVisible: true });

  const handleHomeGiftCodeRedeem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = giftCodeValue.trim().toUpperCase();
    if (!code || isRedeemingGiftCode) return;
    // Coin jingle runs with the egg shake so the wait feels like a reward.
    playCheckinSound();
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
      const eggRect = homeGiftCodeEggRef.current?.getBoundingClientRect();
      if (eggRect) {
        setIsGiftEggBursting(true);
        animateCoinsToBalance(eggRect, 14);
        window.setTimeout(() => setIsGiftEggBursting(false), 1100);
      }
      // Keep the modal open so the egg burst, corn flight, and reset are all
      // visible. Clearing the value also returns the submit button to idle.
      setGiftCodeValue("");
      setIsRedeemingGiftCode(false);
      void refreshAvailableGiftCodes();
      toastAfterClaimAnimation(`Redeemed gift code of ${formatCurrency(amount)}.`);
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

  const completedNodeIds = useMemo(() => activeNodes
    .filter((node) => {
      if (!node.eggImageUrl || !node.dragonImageUrl) return false;
      const endMs = getRunEndMs(node);
      return String(node.status).toLowerCase() !== "active" || endMs !== null && nowMs >= endMs;
    })
    .map((node) => node.id)
    .sort()
    .join(","), [activeNodes, nowMs]);
  const readyHens = useMemo(() => {
    if (!collectiblesLoaded) return [];
    return activeNodes.filter((node) => {
      if (!node.eggImageUrl || !node.dragonImageUrl) return false;
      if (!isRunCycleFinished(node, new Date(nowMs))) return false;
      return !collectibles.some((collectible) => collectible.subscriptionId === node.id && collectible.claimedAt);
    });
  }, [activeNodes, collectibles, collectiblesLoaded, nowMs]);

  useEffect(() => {
    if (!isActive) return;
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
  }, [profile.id, completedNodeIds, isActive]);
  const hatchCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of activeNodes) {
      if (!node.eggImageUrl || !node.dragonImageUrl) continue;
      counts.set(node.itemId, (counts.get(node.itemId) || 0) + 1);
    }
    return counts;
  }, [activeNodes]);
  const totalHatchEvents = useMemo(
    () => [...hatchCounts.values()].reduce((sum, count) => sum + count, 0),
    [hatchCounts]
  );
  const dailyIncome = activeNodes
    .filter((node) => {
      if (!node.eggImageUrl || !node.dragonImageUrl) return false;
      const endMs = getRunEndMs(node);
      return String(node.status).toLowerCase() === "active" && (endMs === null || nowMs < endMs);
    })
    .reduce((sum, node) => sum + getRunMinimumClaimAmount(node), 0);
  const monthlyChickMetricArt = getMonthlyGenesisArt(new Date(nowMs)).chick;
  const handleOpenEgg = async () => {
    if (!confirmingEgg || hatchStage !== "idle") return;
    const egg = confirmingEgg;
    primeCheckinSound();
    setHatchStage("hatching");
    try {
      const response = await fetch("/api/items/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ phone: profile.id, itemId: egg.id }),
      });
      const data = await readApiJson<{ success: boolean; subscription: SubscribedNode; error?: string }>(response);
      if (!data.success || !data.subscription) throw new Error(data.error || "The egg could not be opened. Please try again.");
      onSubscribeSuccess(data.subscription, egg.amount);
      if (!prefersReducedMotion) {
        await new Promise((resolve) => window.setTimeout(resolve, 1450));
      }
      setHatchStage("hatched");
      playCheckinSound();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The egg could not be opened.");
      setHatchStage("idle");
    }
  };

  const finishHatchAndGoToMyChicks = () => {
    setConfirmingEgg(null);
    setHatchStage("idle");
    onNavigateToCollection();
  };

  const closeEggModal = () => {
    setConfirmingEgg(null);
    setHatchStage("idle");
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
      <div className="home-farm-menu-anchor sticky z-40 ml-auto -mb-[88px] h-[88px] w-[126px] -translate-x-2.5 -translate-y-[6px]">
        <button
          ref={settingsButtonRef}
          type="button"
          aria-label="Open farm menu"
          aria-haspopup="dialog"
          aria-expanded={settingsMenuOpen}
          onClick={() => setSettingsMenuOpen(true)}
          className={`user-glossy-button absolute right-0 top-0 inline-flex h-11 items-center rounded-2xl text-[var(--theme-on-primary)] transition-[padding,gap] duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)] ${navCompact ? "gap-1 px-1.5" : "gap-2 px-2.5"}`}
        >
          <motion.span aria-hidden="true" animate={{ opacity: navCompact ? 0 : 1, width: navCompact && !prefersReducedMotion ? 0 : "auto" }} transition={{ duration: prefersReducedMotion ? 0.01 : 0.2, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden whitespace-nowrap text-[11px] font-black">Farm menu</motion.span>
          <span className="relative grid h-8 w-8 shrink-0 place-items-center">
            <img src={barnMenuIcon} alt="" aria-hidden="true" className="h-8 w-8 object-contain" />
          </span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </button>
      </div>

      <header className="space-y-1 justify-center text-left flex flex-col px-1">
        <div className="relative flex min-h-8 items-center justify-start px-0 pr-[10rem]">
          <p className="on-app-gold-text max-w-full truncate text-[10px] font-sans font-black uppercase tracking-[0.18em]">
            {profile.username?.trim() ? `${profile.username.trim()}’s chicken farm` : "Chicken farm"}
          </p>
        </div>
      
      </header>

      <AnimatePresence>
        {settingsMenuOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/60 p-2 sm:p-4"
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
              className="home-farm-menu max-h-[calc(100dvh-1rem)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-[24px] border p-3 text-[var(--theme-on-primary)] shadow-2xl sm:max-h-[min(84dvh,40rem)] sm:max-w-md sm:rounded-[28px] sm:p-4"
            >
              <div className="mb-3 px-1 py-1">
                <div className="flex items-center gap-2.5">
                  <img src={accountDetailsIcon} alt="" aria-hidden="true" className="h-10 w-10 shrink-0 object-contain drop-shadow-md" />
                  <div className="min-w-0 flex-1">
                    <h2 id="home-settings-title" className="truncate font-display text-lg font-black leading-tight">
                      {profile.username?.trim() ? `${profile.username.trim()}’s farm` : "My farm"}
                    </h2>
                    {communityChannels.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-2" aria-label="Community links">
                        {communityChannels.map((channel) => (
                          <a key={channel.label} href={channel.href} target="_blank" rel="noopener noreferrer" aria-label={channel.label} title={channel.label} className="grid h-7 w-7 place-items-center rounded-full transition-transform hover:scale-110 active:scale-95">
                            <img src={channel.icon} alt="" aria-hidden="true" className="h-6 w-6 object-contain" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    ref={closeSettingsButtonRef}
                    type="button"
                    aria-label="Close menu"
                    onClick={() => {
                      setSettingsMenuOpen(false);
                      settingsButtonRef.current?.focus();
                    }}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[var(--theme-on-primary)] transition-opacity hover:opacity-70"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <nav aria-label="Home menu">
                <button type="button" onClick={() => { setSettingsMenuOpen(false); onNavigateToHistory(); }} className="group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-[20px] px-2 py-3 text-center font-bold active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-on-primary)]">
                  <img src={transactionsIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
                  <span>My transactions</span>
                </button>
                <button type="button" onClick={() => { setSettingsMenuOpen(false); onNavigateToCollection(); }} className="group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-[20px] px-2 py-3 text-center font-bold active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-on-primary)]">
                  <img src={tractor} alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
                  <span>My farm</span>
                </button>
                <button type="button" onClick={() => { setSettingsMenuOpen(false); onNavigateToAccount(); }} className="group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-[20px] px-2 py-3 text-center font-bold active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-on-primary)]">
                  <img src={accountDetailsIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
                  <span>Account details</span>
                </button>
                <button type="button" onClick={() => { setSettingsMenuOpen(false); onNavigateToDeposit(); }} className="group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-[20px] px-2 py-3 text-center font-bold active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-on-primary)]">
                  <img src={depositIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
                  <span>Top up</span>
                </button>
                <button type="button" onClick={() => { setSettingsMenuOpen(false); onNavigateToWithdraw(); }} className="group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-[20px] px-2 py-3 text-center font-bold active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-on-primary)]">
                  <img src={withdrawIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
                  <span>Withdraw</span>
                </button>
                <button type="button" onClick={() => { setSettingsMenuOpen(false); setCommunityOpen(true); }} className="group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-[20px] px-2 py-3 text-center font-bold active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-on-primary)]">
                  <img src={communityIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
                  <span>Community</span>
                </button>
                {!isInstalled ? (
                  <button type="button" onClick={() => void handleDownloadApp()} className="group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-[20px] px-2 py-3 text-center font-bold active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-on-primary)]">
                    <img src={downloadAppIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
                    <span>Download app</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setSettingsMenuOpen(false);
                    setHomeGiftCodeOpen(true);
                    void refreshAvailableGiftCodes();
                  }}
                  aria-label={availableGiftCodes.count > 0 ? "Gift code, voucher available" : "Gift code"}
                  className="group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-[20px] px-2 py-3 text-center font-bold active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-on-primary)]"
                >
                  <span className="relative inline-flex">
                    <img src={giftCodeIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
                    {availableGiftCodes.count > 0 ? (
                      <span className="pointer-events-none absolute -right-1 -top-0.5 flex h-3.5 w-3.5" aria-hidden="true">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-[#ffd76a] opacity-70 motion-safe:animate-ping" />
                        <span className="relative inline-flex h-3.5 w-3.5 rounded-full border border-[#6b4e0a]/60 bg-[radial-gradient(circle_at_30%_30%,#fff3b0,#f6c445_55%,#c68a12)] shadow-[0_0_10px_rgba(255,214,94,0.95)]" />
                      </span>
                    ) : null}
                  </span>
                  <span>Gift code</span>
                </button>
                <button type="button" onClick={() => { setSettingsMenuOpen(false); onSignOut(); }} className="group col-span-full flex min-h-14 items-center justify-center gap-3 rounded-[20px] px-3 text-center font-bold text-rose-700 transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600">
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
              className="liquid-glass-panel relative flex max-h-[min(84dvh,36rem)] w-full max-w-md flex-col overflow-y-auto rounded-[30px] border border-[var(--theme-card-border)] p-5 text-[var(--theme-text)] shadow-2xl"
            >
              <div className="flex items-center justify-between gap-4 border-b border-[var(--theme-card-border)] pb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--theme-accent)]">Stay updated.</p>
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
              className="liquid-glass-panel relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-x-hidden overflow-y-auto rounded-[30px] border border-[var(--theme-card-border)] text-[var(--theme-text)] shadow-2xl"
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
                <span className="relative z-10 grid h-20 w-20 shrink-0 place-items-center sm:h-24 sm:w-24">
                  <motion.span
                    aria-hidden="true"
                    animate={{ opacity: isRedeemingGiftCode || isGiftEggBursting ? 1 : 0, scale: isGiftEggBursting ? 1.25 : 1 }}
                    transition={{ duration: prefersReducedMotion ? 0.01 : 0.3 }}
                    className="absolute inset-0 rounded-full bg-[var(--theme-accent)]/30 blur-2xl"
                  />
                  <motion.img
                    ref={homeGiftCodeEggRef}
                    src={egg}
                    alt=""
                    animate={
                      prefersReducedMotion
                        ? { rotate: 0, y: 0, scale: 1 }
                        : isGiftEggBursting
                          ? { rotate: [0, -14, 14, -10, 10, -6, 6, 0], y: [0, -8, 0, -5, 0], scale: [1, 1.12, 0.96, 1.05, 1] }
                          : isRedeemingGiftCode
                            ? { rotate: [-5, 5, -5, 5, 0], y: [0, -2, 0] }
                            : { rotate: 0, y: 0, scale: 1 }
                    }
                    transition={
                      prefersReducedMotion
                        ? { duration: 0.01 }
                        : isGiftEggBursting
                          ? { duration: 0.9, ease: "easeInOut" }
                          : isRedeemingGiftCode
                            ? { duration: 0.55, repeat: Infinity, ease: "easeInOut" }
                            : { duration: 0.2, ease: "easeOut" }
                    }
                    className="relative h-full w-full object-contain drop-shadow-xl"
                  />
                </span>
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
                  className="user-glossy-button flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 font-sans text-sm font-black text-[var(--theme-on-primary)] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:grayscale"
                >
                  {isRedeemingGiftCode ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Gift className="h-4 w-4" aria-hidden="true" />}
                  {isRedeemingGiftCode ? "Redeeming…" : "Redeem gift code"}
                </button>
                {availableGiftCodes.count > 0 ? (
                  <p
                    aria-live="polite"
                    className="flex items-center justify-center gap-1.5 pt-0.5 text-center font-sans text-[12px] font-bold sm:text-[13px]"
                  >
                    <img
                      src={corn}
                      alt=""
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 object-contain drop-shadow-[0_1px_2px_rgba(15,23,42,0.25)]"
                    />
                    <span className="animate-shimmer">{formatCurrency(availableGiftCodes.amount)} available</span>
                  </p>
                ) : null}
              </form>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <section aria-label="Chicken flock progress and daily income" className="grid min-h-[98px] grid-cols-2 gap-3 rounded-[22px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] text-[var(--theme-text)] opacity-70">
            <img src={monthlyChickMetricArt} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
            Eggs hatched
          </p>
          <p aria-label={`${totalHatchEvents} eggs hatched`} className="mt-1 font-display leading-none tabular-nums text-[var(--theme-text)]">
            <span className="text-[30px] font-black sm:text-[34px]">{totalHatchEvents}</span>
          </p>
        </div>
        <div className="min-w-0 text-right">
          <p className="flex items-center justify-end gap-1.5 text-[13px] text-[var(--theme-text)] opacity-70">
            <img src={corn} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
            Daily income
          </p>
          <p className="mt-1 inline-flex max-w-full items-baseline justify-end gap-1.5 truncate leading-none tabular-nums">
            <span className="font-sans text-[11px] font-bold tracking-wide text-[var(--theme-text)] opacity-55">UGX</span>
            <span className="truncate font-display text-[25px] font-black text-[var(--theme-accent)] sm:text-[29px]">
              {formatWholeUgx(dailyIncome)}
            </span>
          </p>
        </div>
      </section>

      <GenesisEggCard
        isActive={isActive}
        profile={profile}
        siteConfig={siteConfig}
        onProfileUpdate={onProfileUpdate}
      />

      {readyHens.length > 0 ? (
        <button
          type="button"
          onClick={onNavigateToCollection}
          className="flex w-full items-center gap-3 rounded-[20px] border border-[var(--theme-primary)]/40 bg-[var(--theme-primary)]/12 px-4 py-3 text-left transition-transform active:scale-[0.99]"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)]">
            <Award className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[15px] font-black text-[var(--theme-text)]">
              {readyHens.length} {readyHens.length === 1 ? "hen" : "hens"} ready to keep
            </span>
            <span className="block text-[12px] font-semibold text-[var(--theme-text)] opacity-60">
              Open My Chicks, then tap Keep hen.
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-[var(--theme-accent)]" aria-hidden="true" />
        </button>
      ) : null}

      <section aria-label="Eggs available to hatch" className="space-y-3">
        {eggs.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {eggs.map((egg, index) => {
              const soldOut = egg.outOfStock;
              const hatchCount = hatchCounts.get(egg.id) || 0;
              const totalDays = Math.max(1, Math.floor(Number(egg.duration) || 15));
              return (
                <article
                  key={egg.id}
                  className="feed-celebration-card overflow-hidden rounded-[20px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)]"
                  style={{ "--feed-stagger": `${Math.min(index, 5) * 30}ms` } as React.CSSProperties}
                >
                  <div
                    className="relative isolate flex aspect-[2.3] items-center justify-center overflow-hidden bg-cover bg-center p-2"
                    style={{
                      backgroundImage: `url("https://i.pinimg.com/1200x/f5/c5/ba/f5c5ba93b44f4c12bfb5045f4896540c.jpg")`,
                    }}
                  >
                    <span
                      className="dragon-egg-art catalog-product-art dragon-egg-float relative z-10"
                      style={{ animationDelay: `${(index % 5) * -0.65}s` }}
                    >
                      <img
                        src={egg.eggImageUrl}
                        alt={`${egg.name} egg`}
                        loading="lazy"
                        className="h-full w-full object-contain dragon-egg-idle-spin"
                      />
                    </span>
                    <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1">
                    <span className="rounded-full bg-[var(--theme-bg)]/85 px-2.5 py-1 text-[14px] font-bold text-[var(--theme-text)]">
                      {egg.category}
                    </span>
                    <span
                      aria-label={`${totalDays} day${totalDays === 1 ? "" : "s"} duration`}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-primary)]/55 bg-[var(--theme-bg)]/90 px-2 py-0.5 text-[10px] font-sans font-semibold leading-none tabular-nums text-[var(--theme-accent)]"
                    >
                      <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                      {totalDays} {totalDays === 1 ? "day" : "days"}
                    </span>
                    {hatchCount > 0 ? (
                      <span className="rounded-full bg-[var(--theme-primary)] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[var(--theme-on-primary)] tabular-nums">
                        Hatched ×{hatchCount}
                      </span>
                    ) : null}
                    </div>

                    {soldOut ? (
                      <span className="absolute bottom-3 right-3 rounded-full bg-[var(--theme-bg)]/85 px-2.5 py-1 text-[14px] font-black text-[var(--theme-text)]">SOLD OUT</span>
                    ) : null}

                  </div>
                  <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-[17px] font-black text-[var(--theme-text)] sm:text-[19px]">{egg.name}</h3>
                      </div>
                      <div className="flex shrink-0 items-end">
                        <p className="inline-flex items-center gap-1 font-display text-[20px] font-black tabular-nums text-[var(--theme-text)] sm:text-[22px]">
                          <img src={priceTag} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
                          {formatCurrency(egg.amount)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[14px]">
                      <span className="inline-flex items-center gap-1.5 text-[var(--theme-text)] opacity-70">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Income per day
                      </span>
                      <span className="inline-flex items-center gap-1 font-display text-[17px] font-semibold tabular-nums text-[var(--theme-accent)]">
                        <img src={corn} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
                        {formatCurrency(egg.dailyYield)}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setConfirmingEgg(egg)}
                        disabled={!!soldOut}
                        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-[var(--theme-primary)]/20 bg-[var(--theme-primary)]/10 px-4 py-3 text-[14px] font-sans font-black text-[var(--theme-accent)] transition-transform duration-200 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Hatch egg <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[20px] border border-dashed border-[var(--theme-card-border)] px-5 py-8 text-center">
            <Egg className="mx-auto h-7 w-7 text-[var(--theme-accent)]" aria-hidden="true" />
            <p className="mt-2 font-display text-[15px] font-black text-[var(--theme-text)]">The farm is empty at the moment</p>
            <p className="mx-auto mt-1 max-w-[26rem] text-[14px] leading-relaxed text-[var(--theme-text)] opacity-60">
              {enabledProductCount > 0
                ? `${enabledProductCount} store product${enabledProductCount === 1 ? "" : "s"} found, but egg and mature chicken are not configured yet. Add egg, young chicken, and mature chicken artwork in Admin.`
                : "Egg products with egg and chicken artwork will appear here when they are added to the store."}
            </p>
          </div>
        )}
      </section>

      <AnimatePresence>
        {confirmingEgg ? (
          <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.18 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-md sm:p-5"
          onClick={() => hatchStage !== "hatching" && closeEggModal()}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="egg-confirm-title"
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 18, scale: prefersReducedMotion ? 1 : 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: prefersReducedMotion ? 0 : 10, scale: prefersReducedMotion ? 1 : 0.98 }}
            transition={prefersReducedMotion ? { duration: 0.01 } : { type: "spring", stiffness: 360, damping: 30, mass: 0.8 }}
            className="liquid-glass-panel liquid-glass-money-panel relative w-full max-w-md overflow-hidden rounded-[30px] border border-white/20 p-4 text-[var(--theme-text)] shadow-2xl sm:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-[var(--theme-primary)]/15 blur-3xl" />
            {hatchStage === "hatched" ? (
              <div className="relative flex flex-col items-center gap-3 pt-2 text-center">
                <span className="grid h-28 w-28 shrink-0 place-items-center rounded-[26px] border border-white/25 bg-[var(--theme-primary)]/10 p-2.5 shadow-lg">
                  <img
                    src={confirmingEgg.youngDragonImageUrl || confirmingEgg.dragonImageUrl || confirmingEgg.eggImageUrl || confirmingEgg.imageUrl || egg}
                    alt={`${confirmingEgg.name} chick`}
                    className="h-full w-full object-contain drop-shadow-[0_8px_12px_rgba(15,23,42,0.22)] dragon-hatch-reveal"
                  />
                </span>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--theme-accent)]">Chick hatched</p>
                <h2 id="egg-confirm-title" className="font-display text-[23px] font-black leading-tight sm:text-[26px]">{confirmingEgg.name}</h2>
                <p className="text-[13px] leading-relaxed opacity-70">
                  Your chick is in My Chicks. Feed it once a day. On the final feed it moves to Completed, where you can keep it as a hen.
                </p>
                <button
                  type="button"
                  onClick={finishHatchAndGoToMyChicks}
                  className="user-glossy-button mt-1 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[13px] font-black text-[var(--theme-on-primary)] transition-transform active:scale-[0.98]"
                >
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  Take me to My Chicks
                </button>
              </div>
            ) : (
              <>
                <div className="relative flex items-center gap-4">
                  <div className="liquid-glass-panel grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-[26px] border border-white/25 bg-[var(--theme-primary)]/10 p-2.5 shadow-lg sm:h-28 sm:w-28">
                    <img
                      src={confirmingEgg.eggImageUrl || confirmingEgg.imageUrl || egg}
                      alt={`${confirmingEgg.name} egg`}
                      className={`h-full w-full object-contain drop-shadow-[0_8px_12px_rgba(15,23,42,0.22)]${hatchStage === "hatching" ? " dragon-egg-hatching" : ""}`}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--theme-accent)]">{hatchStage === "hatching" ? "Hatching" : "Ready to hatch"}</p>
                    <h2 id="egg-confirm-title" className="mt-1 font-display text-[23px] font-black leading-tight sm:text-[26px]">{confirmingEgg.name}</h2>
                    <p className="mt-1.5 text-[13px] leading-relaxed opacity-70">
                      {hatchStage === "hatching" ? "Cracking open…" : `One feed per day. After ${confirmingEgg.duration} feeds this chick becomes a hen.`}
                    </p>
                  </div>
                </div>

                <div className="relative mt-5 space-y-3 rounded-[22px] border border-white/20 bg-white/[0.12] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-xl">
                  <div className="flex items-center justify-between gap-3 text-[14px]">
                    <span className="font-medium opacity-65">Egg cost</span>
                    <span className="font-display font-black tabular-nums">{formatCurrency(confirmingEgg.amount)}</span>
                  </div>
                  <div className="h-px bg-[var(--theme-card-border)]/60" />
                </div>

                {(Number(profile.rechargeableBalance) || 0) < confirmingEgg.amount ? (
                  <p className="relative mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-3 text-[13px] font-semibold text-rose-700">
                    Your capital is too low to open this egg.
                  </p>
                ) : null}

                <div className="relative mt-5 flex gap-3">
                  <button type="button" onClick={closeEggModal} disabled={hatchStage === "hatching"} className="liquid-glass-panel min-h-12 flex-1 rounded-2xl border border-white/20 px-4 py-3 text-[13px] font-bold transition-transform active:scale-[0.98] disabled:opacity-50">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleOpenEgg()}
                    disabled={hatchStage === "hatching" || (Number(profile.rechargeableBalance) || 0) < confirmingEgg.amount}
                    className="user-glossy-button inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[13px] font-black text-[var(--theme-on-primary)] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:grayscale disabled:opacity-50"
                  >
                    {hatchStage === "hatching" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Egg className="h-4 w-4" aria-hidden="true" />}
                    {hatchStage === "hatching" ? "Hatching..." : "Hatch egg"}
                  </button>
                </div>
              </>
            )}
          </motion.section>
        </motion.div>
      ) : null}
      </AnimatePresence>
    </section>
  );
}
