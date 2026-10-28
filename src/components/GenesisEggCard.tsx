import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import { useGatedInterval } from "../hooks/useGatedInterval";
import { fetchJsonWithSignal } from "../utils/abortableFetch";
import { readApiJson } from "../utils/api";
import { celebrateFeed } from "../utils/feedCelebration";
import { getMonthlyGenesisArt } from "../utils/monthlyGenesisArt";
import { getPlatformDayKey, getPlatformDayParts, getPlatformYesterdayKey, msUntilPlatformMidnight, formatClock } from "../utils/runs";
import { playCheckinSound, primeCheckinSound } from "../utils/checkinSound";
import type { SiteConfig, TransactionRow, UserProfile } from "../types";
import corn from "@/src/assets/svg/corn.svg";

interface Props {
  isActive: boolean;
  profile: UserProfile;
  siteConfig?: SiteConfig | null;
  onProfileUpdate: (profile: UserProfile) => void;
}

const SUCCESSFUL_STATUSES = new Set(["SUCCESSFUL", "COMPLETED"]);
const FEED_SUCCESS_TOAST_DELAY_MS = 3000;

function formatRewardAmount(amount: number): string {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return "0";
  return numericAmount.toLocaleString("en-UG", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function GenesisEggCard({ isActive, profile, siteConfig, onProfileUpdate }: Props) {
  const { formatCurrency } = useCurrency();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [claimedDays, setClaimedDays] = useState<Set<string>>(new Set());
  const [isOpening, setIsOpening] = useState(false);
  const [isHatching, setIsHatching] = useState(false);
  const [isFeeding, setIsFeeding] = useState(false);
  const [revealChick, setRevealChick] = useState(false);
  const [revealHen, setRevealHen] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const feedStripRef = useRef<HTMLDivElement | null>(null);
  const targetFeedTileRef = useRef<HTMLButtonElement | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  useGatedInterval(() => setNowMs(Date.now()), 1000, {
    enabled: isActive,
    visibilityGate: true,
    runOnVisible: true,
  });

  const now = new Date(nowMs);
  const todayKey = getPlatformDayKey(now);
  const yesterdayKey = getPlatformYesterdayKey(now);
  const { y, m } = getPlatformDayParts(now);
  const monthKey = `${y}-${String(m + 1).padStart(2, "0")}`;
  const monthDays = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const monthArt = useMemo(() => getMonthlyGenesisArt(now), [y, m]);
  const isOpened = profile.genesisOpenedMonth === monthKey;
  const hasCheckedInToday = profile.lastCheckinDate === todayKey || claimedDays.has(todayKey);
  const currentStreak = Math.max(0, Number(profile.checkinStreak) || 0);
  const nextStreak = hasCheckedInToday
    ? currentStreak
    : profile.lastCheckinDate === yesterdayKey ? currentStreak + 1 : 1;
  const baseBonus = Math.max(0, Number(siteConfig?.checkinBaseBonus) || 0);
  const increment = Math.max(0, Number(siteConfig?.checkinIncrement) || 0);
  const todayReward = baseBonus + Math.max(0, nextStreak - 1) * increment;
  const isRewardUnavailable = hasCheckedInToday;
  const nextFeedCountdown = formatClock(msUntilPlatformMidnight(nowMs));
  const stageThreshold = Math.ceil(monthDays / 2);
  const fedDays = [...claimedDays].filter((key) => key.startsWith(`${monthKey}-`)).length;
  const isMature = fedDays >= stageThreshold;
  const currentStage = isHatching || !isOpened ? "egg" : isMature ? "hen" : "chick";
  const feedDays = useMemo(() => Array.from({ length: 30 }, (_, index) => {
    const date = new Date(`${todayKey}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index - (hasCheckedInToday ? 28 : 29));
    const key = date.toISOString().slice(0, 10);
    const dayDate = new Date(`${key}T12:00:00Z`);
    return {
      key,
      day: Number(key.slice(-2)),
      weekday: new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(dayDate),
      isToday: key === todayKey,
      isTarget: index === 29,
    };
  }), [todayKey, hasCheckedInToday]);
  const targetDayKey = feedDays[feedDays.length - 1]?.key;

  useEffect(() => {
    if (!isActive || !targetDayKey || !feedStripRef.current || !targetFeedTileRef.current) return;
    targetFeedTileRef.current.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [isActive, targetDayKey]);

  useEffect(() => {
    if (!isActive || !profile.id) return;
    const controller = new AbortController();
    const initialDays = new Set<string>();
    if (profile.lastCheckinDate) initialDays.add(profile.lastCheckinDate);
    setClaimedDays(initialDays);
    fetchJsonWithSignal<TransactionRow[]>(`/api/profile/transactions/${encodeURIComponent(profile.id)}`, controller.signal, {
      credentials: "same-origin",
    }).then((rows) => {
      if (controller.signal.aborted || !Array.isArray(rows)) return;
      const days = new Set<string>();
      for (const row of rows) {
        if (String(row.type).toLowerCase() !== "daily_checkin_bonus") continue;
        if (!SUCCESSFUL_STATUSES.has(String(row.status || "").toUpperCase())) continue;
        const timestamp = new Date(row.timestamp);
        if (!Number.isFinite(timestamp.getTime())) continue;
        const key = getPlatformDayKey(timestamp);
        days.add(key);
      }
      if (profile.lastCheckinDate) days.add(profile.lastCheckinDate);
      setClaimedDays(days);
    }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // The profile's current day still gives us enough information to keep
      // today's feed state truthful when historical data is unavailable.
    });
    return () => controller.abort();
  }, [isActive, profile.id, monthKey]);

  const handleOpenEgg = async () => {
    if (isOpening || isOpened) return;
    primeCheckinSound();
    setIsOpening(true);
    setIsHatching(true);
    onProfileUpdate({ ...profile, genesisOpenedMonth: monthKey });
    const hatchStartedAt = Date.now();
    const hatchDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 850;
    let hatchAnimationFinished = false;
    const revealHatch = () => {
      hatchAnimationFinished = true;
      setIsHatching(false);
      setRevealChick(true);
      window.setTimeout(() => setRevealChick(false), 900);
    };
    const hatchAnimationTimer = window.setTimeout(revealHatch, hatchDuration);
    try {
      const response = await fetch("/api/user/genesis/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ phone: profile.id }),
      });
      const data = await readApiJson<{ success: boolean; month: string }>(response);
      if (!data.success || !/^\d{4}-\d{2}$/.test(data.month)) throw new Error("This month's egg could not be opened. Please try again.");
      onProfileUpdate({ ...profileRef.current, genesisOpenedMonth: data.month });
      const remainingAnimation = Math.max(0, hatchDuration - (Date.now() - hatchStartedAt));
      if (remainingAnimation && !hatchAnimationFinished) await new Promise((resolve) => window.setTimeout(resolve, remainingAnimation));
      window.clearTimeout(hatchAnimationTimer);
      if (!hatchAnimationFinished) revealHatch();
      playCheckinSound();
      toast.success("Your monthly egg hatched! Your daily bonus is ready.");
    } catch (error) {
      window.clearTimeout(hatchAnimationTimer);
      onProfileUpdate({ ...profileRef.current, genesisOpenedMonth: profile.genesisOpenedMonth });
      setIsHatching(false);
      setRevealChick(false);
      toast.error(error instanceof Error ? error.message : "This month's egg could not be opened.");
    } finally {
      setIsOpening(false);
      setIsHatching(false);
    }
  };

  const handleFeed = async (source: HTMLButtonElement) => {
    if (!isOpened || hasCheckedInToday || isFeeding) return;
    primeCheckinSound();
    setIsFeeding(true);
    const optimisticAmount = Math.max(0, Number(todayReward) || 0);
    const optimisticProfile: UserProfile = {
      ...profile,
      points: (Number(profile.points) || 0) + optimisticAmount,
      withdrawableBalance: (Number(profile.withdrawableBalance) || 0) + optimisticAmount,
      lastCheckinDate: todayKey,
      checkinStreak: nextStreak,
    };
    profileRef.current = optimisticProfile;
    onProfileUpdate(optimisticProfile);
    setClaimedDays((previous) => new Set(previous).add(todayKey));
    setIsShaking(true);
    window.setTimeout(() => setIsShaking(false), 900);
    playCheckinSound();
    celebrateFeed([source.getBoundingClientRect()]);
    if (fedDays < stageThreshold && fedDays + 1 >= stageThreshold) {
      setRevealHen(true);
      window.setTimeout(() => setRevealHen(false), 900);
    }
    try {
      const response = await fetch("/api/user/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ phone: profile.id }),
      });
      const data = await readApiJson<{ amount: number; bonus?: number; streak: number; platformDate?: string }>(response);
      const amount = Math.max(0, Number(data.amount ?? data.bonus) || 0);
      const streak = Math.max(0, Number(data.streak) || 0);
      const creditedDay = data.platformDate || todayKey;
      const latest = profileRef.current;
      const updatedProfile: UserProfile = {
        ...latest,
        points: (Number(latest.points) || 0) + amount - optimisticAmount,
        withdrawableBalance: (Number(latest.withdrawableBalance) || 0) + amount - optimisticAmount,
        lastCheckinDate: creditedDay,
        checkinStreak: streak,
      };
      profileRef.current = updatedProfile;
      onProfileUpdate(updatedProfile);
      setClaimedDays((previous) => new Set(previous).add(creditedDay));
      const showSuccess = () => toast.success("Daily bonus claimed", {
        description: `${formatCurrency(amount)} added to your withdrawable balance.`,
        duration: 4500,
      });
      window.setTimeout(showSuccess, FEED_SUCCESS_TOAST_DELAY_MS);
    } catch (error) {
      const latest = profileRef.current;
      const rollbackProfile: UserProfile = {
        ...latest,
        points: Math.max(0, (Number(latest.points) || 0) - optimisticAmount),
        withdrawableBalance: Math.max(0, (Number(latest.withdrawableBalance) || 0) - optimisticAmount),
        lastCheckinDate: profile.lastCheckinDate,
        checkinStreak: profile.checkinStreak,
      };
      profileRef.current = rollbackProfile;
      onProfileUpdate(rollbackProfile);
      setClaimedDays((previous) => {
        const next = new Set(previous);
        next.delete(todayKey);
        return next;
      });
      if (fedDays < stageThreshold && fedDays + 1 >= stageThreshold) setRevealHen(false);
      toast.error(error instanceof Error ? error.message : "The daily bonus could not be claimed. Please try again.");
    } finally {
      setIsFeeding(false);
    }
  };

  const handleCycleTap = (source: HTMLButtonElement) => {
    if (isOpening || isHatching || isFeeding) return;
    if (!isOpened) {
      void handleOpenEgg();
      return;
    }
    if (hasCheckedInToday) {
      toast.info("You've claimed today's bonus", {
        description: `Come back in ${formatClock(msUntilPlatformMidnight(nowMs))} for the next bonus.`,
      });
      return;
    }
    void handleFeed(source);
  };

  const handleDayTap = (source: HTMLButtonElement, key: string) => {
    if (key < todayKey) {
      toast.info("That bonus day has passed", { description: "Only today's tile can be claimed." });
      return;
    }
    if (key > todayKey) {
      toast.info("That bonus day is coming up", { description: "Come back on that date to claim it." });
      return;
    }
    if (!isOpened) {
      toast.info("Hatch your egg first", { description: "Tap the egg thumbnail to open it." });
      return;
    }
    handleCycleTap(source);
  };

  return (
    <article
      aria-label="Monthly free egg and daily bonus"
      className={`feed-celebration-card overflow-hidden rounded-[20px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] text-[var(--theme-text)] ${isShaking ? "is-shaking" : ""}`}
    >
      <div className="space-y-2.5 p-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={!isOpened ? "Tap to hatch this month's egg" : hasCheckedInToday ? "View when your next bonus is available" : "Tap to claim today's daily bonus"}
            onClick={(event) => handleCycleTap(event.currentTarget)}
            disabled={isOpening || isHatching || isFeeding}
            aria-busy={isOpening || isHatching || isFeeding}
            className="liquid-glass-panel relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[20px] border border-white/25 bg-[var(--theme-primary)]/10 p-1.5 shadow-lg transition-transform active:scale-95 disabled:cursor-default"
          >
            <span className={`dragon-egg-art${currentStage === "egg" ? " dragon-egg-float" : " dragon-chicken-art"} h-[54px] w-[54px]`}>
              <img
                src={currentStage === "egg" ? monthArt.egg : currentStage === "hen" ? monthArt.hen : monthArt.chick}
                alt={currentStage === "egg" ? "Monthly egg" : currentStage === "hen" ? "Monthly hen" : "Monthly chick"}
                className={`object-contain drop-shadow-[0_8px_12px_rgba(15,23,42,0.22)]${isHatching ? " dragon-egg-hatching" : currentStage === "egg" && !isOpened ? " dragon-egg-idle-spin" : revealChick || revealHen ? " dragon-hatch-reveal" : ""}`}
              />
            </span>
          </button>

          <button
            type="button"
            aria-label={isRewardUnavailable
              ? `Today's bonus is claimed. Next bonus in ${nextFeedCountdown}.`
              : `${!isOpened ? "Hatch and claim bonus" : "Claim today's bonus of"} ${formatRewardAmount(todayReward)}`}
            onClick={(event) => handleCycleTap(event.currentTarget)}
            disabled={isOpening || isHatching || isFeeding || isRewardUnavailable}
            aria-busy={isOpening || isHatching || isFeeding}
            className="user-glossy-button user-glossy-button--small ml-auto inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[14px] text-[var(--theme-on-primary)] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:grayscale disabled:opacity-50"
          >
            <img src={corn} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
            <span className="font-display text-[13px] font-black tabular-nums">{formatRewardAmount(todayReward)}</span>
          </button>
        </div>

        <section aria-label="Thirty-day bonus history" className="space-y-1">
          <div className="flex items-center justify-between px-0.5 text-[14px] font-black tracking-wide opacity-74">
            <span className="flex items-baseline gap-2">
              <span>{new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m, 1)))}</span>
              <span className="text-[9px] font-sans uppercase tracking-[0.14em] opacity-45">Daily bonus</span>
            </span>
            {hasCheckedInToday ? (
              <span aria-label={`Next bonus in ${nextFeedCountdown}`}>
                 <span className="tabular-nums">{nextFeedCountdown}</span>
              </span>
            ) : <span>Today</span>}
          </div>
          <div
            ref={feedStripRef}
            role="group"
            aria-label="Thirty days of bonus history; scroll horizontally"
            className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {feedDays.map(({ key, day, weekday, isToday, isTarget }) => {
              const fed = claimedDays.has(key) || (isToday && hasCheckedInToday);
              const canFeed = isToday && isOpened && !fed && !isOpening && !isHatching && !isFeeding;
              const future = key > todayKey;
              const tileClass = `relative flex h-[52px] w-11 shrink-0 snap-center flex-col items-center justify-center gap-1 rounded-[13px] border text-[10px] font-black tabular-nums transition-colors ${canFeed ? "genesis-feed-tile-pulse border-[var(--theme-primary)]/70 bg-[var(--theme-primary)]/15 text-[var(--theme-accent)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--theme-primary)_22%,transparent)] hover:bg-[var(--theme-primary)]/25 active:scale-95" : isTarget ? "border-[var(--theme-primary)]/50 bg-[var(--theme-primary)]/10 text-[var(--theme-text)]" : fed ? "border-white/15 bg-white/[0.075] text-[var(--theme-accent)]" : "border-white/[0.08] bg-black/[0.035] text-[var(--theme-text)] opacity-55"}`;
              return (
                <button
                  key={key}
                  ref={isTarget ? targetFeedTileRef : undefined}
                  type="button"
                  aria-label={`${key}${fed ? ", claimed" : canFeed ? ", available to claim" : future ? ", upcoming" : ", not claimed"}`}
                  onClick={(event) => handleDayTap(event.currentTarget, key)}
                  disabled={future || isFeeding || isOpening || isHatching}
                  className={`${tileClass} disabled:cursor-default`}
                >
                  <span className="text-[8px] font-black uppercase leading-none opacity-55">{weekday}</span>
                  <span>{day}</span>
                  {(fed || canFeed) && <img src={corn} alt="" aria-hidden="true" className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 object-contain" />}
                </button>
              );
            })}
          </div>
        </section>

      </div>
    </article>
  );
}
