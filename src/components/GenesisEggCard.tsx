import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { sileo } from "sileo";
import { notify } from "../lib/notify";
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
import flameSvg from "@/src/assets/svg/flame.svg";

interface Props {
  isActive: boolean;
  profile: UserProfile;
  siteConfig?: SiteConfig | null;
  onProfileUpdate: (profile: UserProfile) => void;
  onNavigateToWithdraw?: () => void;
}

const SUCCESSFUL_STATUSES = new Set(["SUCCESSFUL", "COMPLETED"]);

function formatRewardAmount(amount: number): string {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return "0";
  return numericAmount.toLocaleString("en-UG", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function GenesisEggCard({ isActive, profile, siteConfig, onProfileUpdate, onNavigateToWithdraw }: Props) {
  const { formatCurrency } = useCurrency();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [claimedDays, setClaimedDays] = useState<Set<string>>(new Set());
  const [historyStatus, setHistoryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [isOpening, setIsOpening] = useState(false);
  const [isHatching, setIsHatching] = useState(false);
  const [isFeeding, setIsFeeding] = useState(false);
  const [revealChick, setRevealChick] = useState(false);
  const [revealHen, setRevealHen] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
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
  const feedDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${todayKey}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index - 6);
    const key = date.toISOString().slice(0, 10);
    const dayDate = new Date(`${key}T12:00:00Z`);
    return {
      key,
      day: Number(key.slice(-2)),
      weekday: new Intl.DateTimeFormat("en", { weekday: "narrow", timeZone: "UTC" }).format(dayDate),
      isToday: key === todayKey,
    };
  }), [todayKey]);

  useEffect(() => {
    if (!isActive || !profile.id) return;
    const controller = new AbortController();
    setHistoryStatus("loading");
    const initialDays = new Set<string>();
    if (profile.lastCheckinDate) initialDays.add(profile.lastCheckinDate);
    setClaimedDays(initialDays);
    fetchJsonWithSignal<TransactionRow[]>(`/api/profile/transactions/${encodeURIComponent(profile.id)}`, controller.signal, {
      credentials: "same-origin",
    }).then((rows) => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(rows)) throw new Error("Bonus history could not be loaded.");
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
      setClaimedDays((previous) => new Set([...days, ...previous]));
      setHistoryStatus("ready");
    }).catch((error) => {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      setHistoryStatus("error");
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
      notify("success", "Your monthly egg hatched! Your daily bonus is ready.");
    } catch (error) {
      window.clearTimeout(hatchAnimationTimer);
      onProfileUpdate({ ...profileRef.current, genesisOpenedMonth: profile.genesisOpenedMonth });
      setIsHatching(false);
      setRevealChick(false);
      notify("error", error instanceof Error ? error.message : "This month's egg could not be opened.");
    } finally {
      setIsOpening(false);
      setIsHatching(false);
    }
  };

  const handleFeed = async (source: HTMLButtonElement) => {
    if (!isOpened || hasCheckedInToday || isFeeding) return;
    primeCheckinSound();
    setIsFeeding(true);
    const sourceRect = source.getBoundingClientRect();
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
        points: (Number(latest.points) || 0) + amount,
        withdrawableBalance: (Number(latest.withdrawableBalance) || 0) + amount,
        lastCheckinDate: creditedDay,
        checkinStreak: streak,
      };
      profileRef.current = updatedProfile;
      onProfileUpdate(updatedProfile);
      setClaimedDays((previous) => new Set(previous).add(creditedDay));
      setIsShaking(true);
      window.setTimeout(() => setIsShaking(false), 900);
      playCheckinSound();
      celebrateFeed([sourceRect]);
      if (fedDays < stageThreshold && fedDays + 1 >= stageThreshold) {
        setRevealHen(true);
        window.setTimeout(() => setRevealHen(false), 900);
      }
      sileo.action({
        title: "Daily bonus claimed",
        description: amount > 0
          ? `${formatCurrency(amount)} added to your withdrawable balance.`
          : `Day ${streak} streak saved.`,
        icon: <img src={flameSvg} alt="" className="h-5 w-5 object-contain" />,
        duration: 4500,
        ...(onNavigateToWithdraw ? { button: { title: "View balance", onClick: onNavigateToWithdraw } } : {}),
      });
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "The daily bonus could not be claimed. Please try again.");
    } finally {
      setIsFeeding(false);
    }
  };

  const handleDayTap = (source: HTMLButtonElement, key: string) => {
    if (key < todayKey) {
      notify("info", "That bonus day has passed", { description: "Only today's tile can be claimed." });
      return;
    }
    if (!isOpened) {
      notify("info", "Hatch your egg first", { description: "Tap the egg thumbnail to open it." });
      return;
    }
    if (hasCheckedInToday) {
      notify("info", "You've claimed today's bonus", { description: `Come back in ${formatClock(msUntilPlatformMidnight(nowMs))} for the next bonus.` });
      return;
    }
    void handleFeed(source);
  };

  return (
    <article
      aria-label="Daily bonus"
      className={`feed-celebration-card overflow-hidden rounded-[20px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] text-[var(--theme-text)] ${isShaking ? "is-shaking" : ""}`}
    >
      <div className="space-y-2 p-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={!isOpened ? "Hatch this month's egg" : "This month's egg is open"}
            onClick={() => void handleOpenEgg()}
            disabled={isOpened || isOpening || isHatching || isFeeding}
            aria-busy={isOpening || isHatching || isFeeding}
            className="liquid-glass-panel relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[16px] border border-white/25 bg-[var(--theme-primary)]/10 p-1 shadow-lg transition-transform active:scale-95 disabled:cursor-default"
          >
            <span className={`dragon-egg-art${currentStage === "egg" ? " dragon-egg-float" : " dragon-chicken-art"} h-10 w-10`}>
              <img
                src={currentStage === "egg" ? monthArt.egg : currentStage === "hen" ? monthArt.hen : monthArt.chick}
                alt={currentStage === "egg" ? "Monthly egg" : currentStage === "hen" ? "Monthly hen" : "Monthly chick"}
                className={`object-contain drop-shadow-[0_8px_12px_rgba(15,23,42,0.22)]${isHatching ? " dragon-egg-hatching" : currentStage === "egg" && !isOpened ? " dragon-egg-idle-spin" : revealChick || revealHen ? " dragon-hatch-reveal" : ""}`}
              />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[13px] font-black leading-tight">Daily bonus</p>
            <p className="truncate text-[10px] font-semibold leading-tight opacity-65">
              {isOpening || isHatching
                ? "Hatching monthly egg…"
                : isFeeding
                  ? "Adding bonus to your balance…"
                  : !isOpened
                    ? "Tap to unlock"
                    : hasCheckedInToday
                      ? `Next bonus in ${nextFeedCountdown}`
                      : `Day ${nextStreak} streak reward`}
            </p>
          </div>

          <button
            type="button"
            aria-label={isRewardUnavailable
              ? `Today's bonus is claimed. Next bonus in ${nextFeedCountdown}.`
              : isOpening || isHatching
                ? "Hatching monthly egg"
                : isFeeding
                  ? "Claiming daily bonus"
                  : !isOpened
                    ? "Hatch monthly egg"
                    : `Claim UGX ${formatRewardAmount(todayReward)} to your withdrawable balance`}
            onClick={(event) => {
              if (!isOpened) void handleOpenEgg();
              else if (!hasCheckedInToday) void handleFeed(event.currentTarget);
            }}
            disabled={isOpening || isHatching || isFeeding || isRewardUnavailable}
            aria-busy={isOpening || isHatching || isFeeding}
            className="user-glossy-button user-glossy-button--small inline-flex max-w-[52%] shrink-0 items-center justify-center gap-1 rounded-[12px] px-2 py-2 text-center text-[10px] font-black leading-tight text-[var(--theme-on-primary)] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:grayscale disabled:opacity-50"
          >
            {isOpening || isHatching || isFeeding ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" /> : null}
            <span>
              {isOpening || isHatching
                ? "Hatching…"
                : isFeeding
                  ? "Claiming…"
                  : isRewardUnavailable
                    ? "Claimed"
                    : !isOpened
                      ? "Hatch monthly egg"
                      : `Claim UGX ${formatRewardAmount(todayReward)}`}
            </span>
          </button>
        </div>

        <section aria-label="Daily bonus for the last seven days" className="space-y-1">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[9px] font-black uppercase tracking-[0.12em] opacity-55">Last 7 days</span>
            {historyStatus === "loading" ? (
              <span className="text-[9px] font-semibold opacity-55">Loading history…</span>
            ) : historyStatus === "error" ? (
              <span className="text-[9px] font-semibold text-[var(--theme-accent)]">History unavailable</span>
            ) : null}
          </div>
          <div
            role="group"
            aria-label="Seven most recent daily bonuses"
            className="grid grid-cols-7 gap-1"
          >
            {feedDays.map(({ key, day, weekday, isToday }) => {
              const fed = claimedDays.has(key) || (isToday && hasCheckedInToday);
              const canFeed = isToday && isOpened && !fed && !isOpening && !isHatching && !isFeeding;
              const tileClass = `relative flex min-w-0 h-9 flex-col items-center justify-center gap-0.5 rounded-[10px] border text-[9px] font-black tabular-nums transition-colors ${canFeed ? "genesis-feed-tile-pulse border-[var(--theme-primary)]/70 bg-[var(--theme-primary)]/15 text-[var(--theme-accent)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--theme-primary)_22%,transparent)] hover:bg-[var(--theme-primary)]/25 active:scale-95" : isToday ? "border-[var(--theme-primary)]/50 bg-[var(--theme-primary)]/10 text-[var(--theme-text)]" : fed ? "border-white/15 bg-white/[0.075] text-[var(--theme-accent)]" : "border-white/[0.08] bg-black/[0.035] text-[var(--theme-text)] opacity-55"}`;
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={`${key}${fed ? ", claimed" : canFeed ? ", available to claim" : ", not claimed"}`}
                  onClick={(event) => handleDayTap(event.currentTarget, key)}
                  disabled={isFeeding || isOpening || isHatching}
                  className={`${tileClass} disabled:cursor-default`}
                >
                  <span className="text-[8px] font-black uppercase leading-none opacity-55">{isToday ? "Today" : weekday}</span>
                  <span>{day}</span>
                  {fed && <img src={corn} alt="" aria-hidden="true" className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 object-contain" />}
                </button>
              );
            })}
          </div>
          {historyStatus === "error" ? (
            <p aria-live="polite" className="text-[9px] leading-tight opacity-60">
              Past claims couldn’t be loaded. Today’s claim status remains available.
            </p>
          ) : null}
        </section>

      </div>
    </article>
  );
}
