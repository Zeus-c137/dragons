/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared run helpers: feed-based progress, daily availability, greetings.
 * Home and Income share this math so both screens agree.
 */
import type { SubscribedNode, SubscriptionItem } from "../types";

export interface RunProgress {
  elapsed: number;
  total: number;
  percent: number;
}

/**
 * Catalog match is display-only (thumbnails, names): economics always come
 * from the purchase-time node snapshot. The server credits and expires runs
 * from `sub.duration` / `sub.dailyYield` (see claimDailyReward), so the
 * screens must read the same snapshot — otherwise an admin duration/yield
 * edit would show a run as done while the server keeps paying it (or show
 * it active after the server expired it). Admin edits therefore apply to
 * new purchases only. Catalog is a last-resort fallback for legacy nodes
 * missing snapshot fields, then 15 days.
 */
export function getRunCatalogMatch(
  node: SubscribedNode,
  items?: SubscriptionItem[]
): SubscriptionItem | undefined {
  if (!items) return undefined;
  return items.find((item) => item.id === node.itemId || item.name === node.itemName);
}

export function getRunTotalDays(
  node: SubscribedNode,
  items?: SubscriptionItem[]
): number {
  const mapped = getRunCatalogMatch(node, items);
  return Math.max(1, Math.floor(Number(node.duration ?? mapped?.duration) || 0) || 15);
}

export function getRunDailyRate(
  node: SubscribedNode,
  items?: SubscriptionItem[]
): number {
  const mapped = getRunCatalogMatch(node, items);
  const rate = node.dailyYield !== undefined ? node.dailyYield : mapped?.dailyYield;
  return Number(rate) || 0;
}

/** One fixed daily income payment, formatted as a whole UGX amount. */
export function getRunMinimumClaimAmount(node: SubscribedNode): number {
  return Math.ceil(Math.max(0, getRunDailyRate(node)));
}

function platformDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDateKeyDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function getRunClaimableReturns(
  node: SubscribedNode,
  now = new Date()
): { amount: number; days: number; throughDate: string | null } {
  const activationTime = new Date(node.startDate).getTime();
  if (!Number.isFinite(activationTime)) return { amount: 0, days: 0, throughDate: null };
  const dailyRate = getRunDailyRate(node);
  if (node.eggImageUrl && node.dragonImageUrl && dailyRate > 0) {
    const throughDate = platformDateKey(now);
    const totalDays = getRunTotalDays(node);
    const daysFed = Math.min(totalDays, Math.max(0, Math.floor(Number(node.daysFed) || 0)));
    if (String(node.status).toLowerCase() !== "active" || daysFed >= totalDays) {
      return { amount: 0, days: 0, throughDate: null };
    }

    const lastClaimedDate = String(node.lastClaimedDate || "");
    const lastClaimedPlatformDate = /^\d{4}-\d{2}-\d{2}$/.test(lastClaimedDate)
      ? lastClaimedDate
      : Number.isFinite(new Date(lastClaimedDate).getTime())
        ? platformDateKey(new Date(lastClaimedDate))
        : "";
    if (lastClaimedPlatformDate === throughDate) return { amount: 0, days: 0, throughDate: null };
    return { amount: getRunMinimumClaimAmount(node), days: 1, throughDate };
  }

  const activationDate = platformDateKey(new Date(activationTime));
  const today = platformDateKey(now);
  const finalDate = addDateKeyDays(activationDate, getRunTotalDays(node) - 1);
  const throughDate = today < finalDate ? today : finalDate;
  const legacyClaimedDays = dailyRate > 0
    ? Math.max(0, Math.floor((Number(node.totalEarned) || 0) / dailyRate))
    : 0;
  const firstUnclaimedDate = node.lastClaimedDate
    ? addDateKeyDays(node.lastClaimedDate, 1)
    : addDateKeyDays(activationDate, legacyClaimedDays);
  if (firstUnclaimedDate > throughDate) return { amount: 0, days: 0, throughDate: null };

  const start = new Date(`${firstUnclaimedDate}T00:00:00Z`).getTime();
  const end = new Date(`${throughDate}T00:00:00Z`).getTime();
  const days = Math.floor((end - start) / 86_400_000) + 1;
  return {
    amount: dailyRate * days,
    days,
    throughDate
  };
}

export function isRunCycleFinished(node: SubscribedNode, now = new Date()): boolean {
  if (String(node.status).toLowerCase() !== "active") return true;
  if (node.eggImageUrl && node.dragonImageUrl) {
    return Math.max(0, Math.floor(Number(node.daysFed) || 0)) >= getRunTotalDays(node);
  }
  const activationTime = new Date(node.startDate).getTime();
  if (!Number.isFinite(activationTime)) return false;
  const activationDate = platformDateKey(new Date(activationTime));
  const finalDate = addDateKeyDays(activationDate, getRunTotalDays(node) - 1);
  return platformDateKey(now) > finalDate;
}

/**
 * Chicken cycle progress advances only after a successful manual feed.
 * Other products retain their credited-earnings day estimate.
 */
export function getRunElapsedDays(node: SubscribedNode, items?: SubscriptionItem[]): number {
  const total = getRunTotalDays(node, items);
  if (node.eggImageUrl && node.dragonImageUrl) {
    return Math.min(total, Math.max(0, Math.floor(Number(node.daysFed) || 0)));
  }
  const daily = getRunDailyRate(node, items);
  if (daily <= 0) return 1;
  const earned = Number(node.totalEarned) || 0;
  return Math.min(total, Math.max(1, Math.floor(earned / daily)));
}

export function getRunProgress(
  node: SubscribedNode,
  items?: SubscriptionItem[]
): RunProgress {
  const total = getRunTotalDays(node, items);
  const elapsed = getRunElapsedDays(node, items);
  return { elapsed, total, percent: Math.min(100, Math.max(0, (elapsed / total) * 100)) };
}

/**
 * One definition of "done" shared by progress bars, pills, and filters:
 * expired always; otherwise done when the bar itself reads complete
 * (elapsed >= total) or the status already left active. This keeps the
 * Completed tab in sync with what the bars show, regardless of whether
 * the payout cron has flipped the row's status yet.
 */
export function getRunState(
  node: SubscribedNode,
  items?: SubscriptionItem[]
): "active" | "done" | "expired" {
  const status = String(node.status || "").toLowerCase();
  if (status === "expired") return "expired";
  if (status !== "active") return "done";
  const { elapsed, total } = getRunProgress(node, items);
  return elapsed >= total ? "done" : "active";
}

export function getRunEndMs(node: SubscribedNode): number | null {
  if (node.eggImageUrl && node.dragonImageUrl) {
    // Manual-feed cycles have no scheduled end; completion happens on the
    // final successful feed.
    if (Math.max(0, Math.floor(Number(node.daysFed) || 0)) < getRunTotalDays(node)) return null;
    const lastFeed = new Date(node.lastClaimedDate).getTime();
    if (Number.isFinite(lastFeed)) return lastFeed;
    const activationTime = new Date(node.startDate).getTime();
    if (Number.isFinite(activationTime)) {
      return activationTime;
    }
    return 0;
  }
  const ms = new Date(node.endDate).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Nearest-maturing active run — the Rent Clock target. */
export function getNextMaturingRun(nodes: SubscribedNode[]): SubscribedNode | null {
  let best: SubscribedNode | null = null;
  let bestMs = Infinity;
  for (const node of nodes) {
    if (node.status !== "active") continue;
    const ms = getRunEndMs(node);
    if (ms === null) continue;
    if (ms < bestMs) {
      bestMs = ms;
      best = node;
    }
  }
  return best;
}

/** "06D 14:22:08" — days + clock, zero-padded. Clamps at zero. */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(days).padStart(2, "0")}D ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** Ms until the next Africa/Nairobi date boundary for daily return availability. */
export function msToNairobiMidnight(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  // Nairobi is UTC+3 with no DST: Nairobi midnight starting date D == 21:00
  // UTC on date D itself (00:00+03:00). Next midnight from date D is 21:00 UTC
  // on date D — NOT D+1, which overshoots by a full day.
  const utcMidnight = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    21,
    0,
    0
  );
  let remaining = utcMidnight - now.getTime();
  // Exactly at/after midnight UTC artificats: roll to the next one.
  if (remaining <= 0) remaining += 24 * 3600 * 1000;
  return remaining;
}

/** Labeled clock "07h:12m:44s" for the sub-24h daily countdown. */
export function formatClock(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}h:${pad(minutes)}m:${pad(seconds)}s`;
}

/** Compact "12D 04:00:11" for run rows — seconds included so rows visibly tick. */
export function formatCountdownShort(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${days}D ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** Time-of-day greeting on platform time (Africa/Nairobi). */
export function getDaypartGreeting(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Nairobi",
      hour: "numeric",
      hour12: false,
    }).format(now)
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Platform timezone — Africa/Nairobi is EAT (UTC+3, no DST), Uganda wall time. */
export const PLATFORM_TIME_ZONE = "Africa/Nairobi";

/** Platform calendar parts for a given instant (m is 0-indexed like Date). */
export function getPlatformDayParts(date = new Date()): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PLATFORM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { y: Number(values.year), m: Number(values.month) - 1, d: Number(values.day) };
}

/** Platform day key YYYY-MM-DD for a given instant. */
export function getPlatformDayKey(date = new Date()): string {
  const { y, m, d } = getPlatformDayParts(date);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Platform yesterday key. The platform offset is constant (no DST), so -24h
 *  always lands on the previous platform calendar day. */
export function getPlatformYesterdayKey(date = new Date()): string {
  return getPlatformDayKey(new Date(date.getTime() - 24 * 3600 * 1000));
}

/** ms until the next platform midnight — the moment the check-in day resets. */
export function msUntilPlatformMidnight(nowMs = Date.now()): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: PLATFORM_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(nowMs)).map((part) => [part.type, part.value])
  );
  // hour12:false can report midnight as "24" — normalize to a 0-86399 range.
  const elapsedSec = (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) % 86400;
  return Math.max(0, 86400 * 1000 - elapsedSec * 1000 - (nowMs % 1000));
}

/** Today on the platform calendar — matches dailyCheckin and ProfileView's todayStr. */
export function getTodayKey(date = new Date()): string {
  return getPlatformDayKey(date);
}
