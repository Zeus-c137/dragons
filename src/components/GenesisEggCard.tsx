import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
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
    try {
      const response = await fetch("/api/user/genesis/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ phone: profile.id }),
      });
      const data = await readApiJson<{ success: boolean; month: string }>(response);
      if (!data.success || !/^\d{4}-\d{2}$/.test(data.month)) throw new Error("This month's egg could not be opened. Please try again.");
      onProfileUpdate({ ...profile, genesisOpenedMonth: data.month });
      playCheckinSound();
      setIsHatching(true);
      await new Promise((resolve) => window.setTimeout(resolve, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1450));
      setIsHatching(false);
      setRevealChick(true);
      window.setTimeout(() => setRevealChick(false), 900);
      toast.success("Your monthly egg hatched! Your chick is ready to feed.");
    } catch (error) {
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
      const updatedProfile: UserProfile = {
        ...profile,
        points: (Number(profile.points) || 0) + amount,
        withdrawableBalance: (Number(profile.withdrawableBalance) || 0) + amount,
        lastCheckinDate: creditedDay,
        checkinStreak: streak,
      };
      const wasMature = fedDays >= stageThreshold;
      onProfileUpdate(updatedProfile);
      setClaimedDays((previous) => new Set(previous).add(creditedDay));
      setIsShaking(true);
      window.setTimeout(() => setIsShaking(false), 900);
      playCheckinSound();
      celebrateFeed([source.getBoundingClientRect()]);
      if (!wasMature && fedDays + 1 >= stageThreshold) {
        setRevealHen(true);
        window.setTimeout(() => setRevealHen(false), 900);
      }
      const showSuccess = () => toast.success("Chick fed", {
        description: `${formatCurrency(amount)} added to your withdrawable balance.`,
        duration: 4500,
      });
      window.setTimeout(showSuccess, FEED_SUCCESS_TOAST_DELAY_MS);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The chick could not be fed. Please try again.");
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
      toast.info("You've fed your chick today", {
        description: `Come back in ${formatClock(msUntilPlatformMidnight(nowMs))} for the next feed.`,
      });
      return;
    }
    void handleFeed(source);
  };

  const handleDayTap = (source: HTMLButtonElement, key: string) => {
    if (key < todayKey) {
      toast.info("That feed day has passed", { description: "Only today's tile can be fed." });
      return;
    }
    if (key > todayKey) {
      toast.info("That feed day is coming up", { description: "Come back on that date to feed." });
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
      aria-label="Monthly free egg"
      className={`feed-celebration-card liquid-glass-panel overflow-hidden rounded-[20px] border border-white/20 text-[var(--theme-text)] ${isShaking ? "is-shaking" : ""}`}
    >
      <div className="space-y-2.5 p-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label={!isOpened ? "Tap to hatch this month's egg" : hasCheckedInToday ? "View when your next feed is available" : "Tap to feed today's chick"}
            onClick={(event) => handleCycleTap(event.currentTarget)}
            disabled={isOpening || isHatching || isFeeding}
            className="liquid-glass-panel relative grid h-[68px] w-[68px] shrink-0 place-items-center rounded-[20px] border border-white/20 transition-transform active:scale-95 disabled:cursor-wait"
          >
            <span className={`dragon-egg-art${currentStage === "egg" ? " dragon-egg-float" : " dragon-chicken-art"} h-14 w-14`}>
              <img
                src={currentStage === "egg" ? monthArt.egg : currentStage === "hen" ? monthArt.hen : monthArt.chick}
                alt={currentStage === "egg" ? "Monthly egg" : currentStage === "hen" ? "Monthly hen" : "Monthly chick"}
                className={`object-contain${isHatching ? " dragon-egg-hatching" : currentStage === "egg" && !isOpened ? " dragon-egg-idle-spin" : revealChick || revealHen ? " dragon-hatch-reveal" : ""}`}
              />
            </span>
            {isOpening && <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] shadow"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /></span>}
          </button>

          <button
            type="button"
            onClick={(event) => handleCycleTap(event.currentTarget)}
            disabled={isOpening || isHatching || isFeeding}
            className="flex min-h-[68px] min-w-0 flex-1 items-center justify-start gap-2 rounded-[18px] border border-white/15 bg-white/[0.045] px-3 text-left transition-colors hover:bg-white/[0.08] active:scale-[0.99] disabled:cursor-wait"
          >
            <span className="flex min-w-0 flex-col items-start gap-0.5">
              <span className="block max-w-full truncate text-[9px] font-black uppercase tracking-wide opacity-65">
                {isOpening || isHatching ? "Hatching egg..." : isFeeding ? "Feeding chick..." : hasCheckedInToday ? `Come back in ${formatClock(msUntilPlatformMidnight(nowMs))}` : !isOpened ? "Tap to hatch" : "Today's feed"}
              </span>
              <span className="flex items-center gap-1 font-display text-[14px] font-black tabular-nums text-[var(--theme-primary)]">
                <img src={corn} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                {formatCurrency(todayReward)}
              </span>
            </span>
          </button>
        </div>

        <section aria-label="Thirty-day feed history" className="space-y-1">
          <div className="flex items-center justify-between px-0.5 text-[9px] font-black uppercase tracking-wide opacity-55">
            <span>{new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m, 1)))}</span>
            <span>{hasCheckedInToday ? "Next feed" : "Today"}</span>
          </div>
          <div
            ref={feedStripRef}
            role="group"
            aria-label="Thirty days of feeding history; scroll horizontally"
            className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto overscroll-x-contain pb-1"
          >
            {feedDays.map(({ key, day, weekday, isToday, isTarget }) => {
              const fed = claimedDays.has(key) || (isToday && hasCheckedInToday);
              const canFeed = isToday && isOpened && !fed && !isHatching && !isFeeding;
              const future = key > todayKey;
              const tileClass = `relative flex h-[52px] w-11 shrink-0 snap-center flex-col items-center justify-center gap-1 rounded-[13px] border text-[10px] font-black tabular-nums transition-colors ${canFeed ? "genesis-feed-tile-pulse border-[var(--theme-primary)]/70 bg-[var(--theme-primary)]/15 text-[var(--theme-primary)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--theme-primary)_22%,transparent)] hover:bg-[var(--theme-primary)]/25 active:scale-95" : isTarget ? "border-[var(--theme-primary)]/50 bg-[var(--theme-primary)]/10 text-[var(--theme-text)]" : fed ? "border-white/15 bg-white/[0.075] text-[var(--theme-primary)]" : "border-white/[0.08] bg-black/[0.035] text-[var(--theme-text)] opacity-55"}`;
              return (
                <button
                  key={key}
                  ref={isTarget ? targetFeedTileRef : undefined}
                  type="button"
                  aria-label={`${key}${fed ? ", fed" : canFeed ? ", available to feed" : future ? ", upcoming" : ", not fed"}`}
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
