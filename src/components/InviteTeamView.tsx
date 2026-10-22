import { motion, AnimatePresence } from "motion/react";
import { useCurrency } from "@/src/currency";
import { getLevelMetrics } from "@/src/utils/referral";
import type { ReferralStat, SiteConfig } from "@/src/types";
import { Loader2, Users } from "lucide-react";
import { optimizedImageUrl } from "@/src/utils/imageUtils";
import { getInitial, getExit, getSpring } from "@/src/utils/motion";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";

type Props = {
  stats: ReferralStat[];
  isLoading: boolean;
  activeLevel: 1 | 2 | 3 | 4;
  onActiveLevelChange: (l: 1 | 2 | 3 | 4) => void;
  activeLevelStats: ReferralStat[];
  siteConfig?: SiteConfig | null;
  onBack?: () => void;
  pendingReferralRewards: number;
  isClaiming: boolean;
  onClaimRewards: () => void;
};

function formatJoinedDate(value?: string): string {
  if (!value) return "Recently joined";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently joined";
  return date.toLocaleDateString("en-UG", { month: "short", day: "numeric", year: "numeric" });
}

function memberInitials(stat: ReferralStat): string {
  const name = String(stat.username || stat.inviteeName || "").trim();
  if (name) return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return String(stat.id || "TM").slice(-2).toUpperCase();
}

function TeamHero({ stats, isLoading, siteConfig }: { stats: ReferralStat[]; isLoading: boolean; siteConfig?: SiteConfig | null }) {
  const { formatCurrency } = useCurrency();
  const totalEarned = stats.reduce((sum, member) => sum + Number(member.rewardAmount || 0), 0);
  const activeRuns = stats.reduce((sum, member) => sum + Number(member.activeProductsCount || 0), 0);
  return (
    <section>
      <div>

        <div className="liquid-glass-panel mt-1 grid grid-cols-2 gap-3 rounded-[22px] border border-white/15 p-3.5 backdrop-blur-[20px] backdrop-saturate-[180%]">
          <div>
            <p className="text-[12px] font-sans text-[var(--theme-text)] opacity-60">Friends referred</p>
            {isLoading && stats.length === 0 ? <div className="mt-2 h-6 w-16 rounded bg-white/10 animate-pulse" /> : <p className="mt-1 font-display text-[21px] font-black leading-none text-[var(--theme-text)]">{stats.length}</p>}
          </div>
          <div className="text-right">
            <p className="text-[12px] font-sans text-[var(--theme-text)] opacity-60">Referral income</p>
            {isLoading && stats.length === 0 ? <div className="ml-auto mt-2 h-6 w-28 rounded bg-white/10 animate-pulse" /> : <p className="mt-1 font-display text-[19px] font-black leading-none text-[var(--theme-primary)]">{formatCurrency(totalEarned)}</p>}
          </div>
        </div>
       
      </div>
    </section>
  );
}

function LevelTabs({
  activeLevel,
  onChange,
  metrics,
}: {
  activeLevel: number;
  onChange: (level: 1 | 2 | 3 | 4) => void;
  metrics: ReturnType<typeof getLevelMetrics>;
}) {
  return (
    <div className="liquid-glass-panel grid grid-cols-4 rounded-2xl border border-white/10 p-1 backdrop-blur-[20px]">
      {metrics.map((metric) => {
        const selected = activeLevel === metric.level;
        return (
          <button
            key={metric.level}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(metric.level)}
            className={`relative rounded-xl px-1 py-2.5 text-center text-[11px] tracking-wide transition-colors sm:text-[12px] ${selected ? "bg-[var(--theme-primary)]/15 font-black text-[var(--theme-primary)] shadow-inner" : "font-semibold text-[var(--theme-text)] opacity-60 hover:opacity-100"}`}
          >
            <span className="block font-sans">Level {metric.level}</span>
          </button>
        );
      })}
    </div>
  );
}

function MemberRow({ stat }: { stat: ReferralStat }) {
  const { formatCurrency } = useCurrency();
  const name = stat.username?.trim() || "Username";
  return (
    <article className="flex items-center gap-3 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-[var(--theme-primary)]/10 font-display text-[13px] font-black text-[var(--theme-primary)]">
        {stat.milestoneTierImageUrl ? <img src={optimizedImageUrl(stat.milestoneTierImageUrl, 160)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : memberInitials(stat)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-sans font-bold text-[var(--theme-text)]">{name}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] text-[var(--theme-text)] opacity-50">Joined {formatJoinedDate(stat.joinedDate || stat.dateJoined)}</p>
        <p className="font-display text-[14px] font-black tabular-nums text-[var(--theme-primary)]">{formatCurrency(Number(stat.rewardAmount || 0))}</p>
      </div>
    </article>
  );
}

function EmptyState({ level }: { level: number }) {
  return (
    <div className="flex min-h-[150px] flex-col items-center justify-center px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--theme-primary)]/10 text-[var(--theme-primary)]"><Users className="h-5 w-5" /></span>
      <p className="mt-3 text-[13px] font-sans font-bold">No one at Level {level} yet</p>
      <p className="mt-1 max-w-[230px] text-[11px] leading-relaxed text-[var(--theme-text)] opacity-50">As your invitations join, they’ll appear here with their activity and contribution.</p>
    </div>
  );
}

function ListSkeleton() {
  return <div className="divide-y divide-white/10">{[0, 1, 2].map((index) => <div key={index} className="flex items-center gap-3 py-3"><div className="h-10 w-10 rounded-full bg-white/10 animate-pulse" /><div className="flex-1 space-y-2"><div className="h-3 w-32 rounded bg-white/10 animate-pulse" /><div className="h-2.5 w-24 rounded bg-white/5 animate-pulse" /></div><div className="h-4 w-20 rounded bg-white/10 animate-pulse" /></div>)}</div>;
}

export default function InviteTeamView({ stats, isLoading, activeLevel, onActiveLevelChange, activeLevelStats, siteConfig, pendingReferralRewards, isClaiming, onClaimRewards }: Props) {
  const { formatCurrency } = useCurrency();
  const reduced = useReducedMotion();
  const spring = getSpring(reduced);
  const metrics = getLevelMetrics(stats, siteConfig);
  const activeMetric = metrics.find((metric) => metric.level === activeLevel);

  return (
    <div className="flex w-full min-h-0 flex-col gap-3 text-[var(--theme-text)]">
      <TeamHero stats={stats} isLoading={isLoading} siteConfig={siteConfig} />

      <section aria-label="Referral income ready to collect" className="liquid-glass-panel flex flex-col gap-3 rounded-[22px] border border-[var(--theme-primary)]/25 p-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-[var(--theme-text)] opacity-60">Ready to collect</p>
          <p className="mt-0.5 truncate font-display text-[18px] font-black tabular-nums text-[var(--theme-primary)]">{formatCurrency(pendingReferralRewards)}</p>
        </div>
        <button
          type="button"
          onClick={onClaimRewards}
          disabled={pendingReferralRewards <= 0 || isClaiming}
          aria-busy={isClaiming}
          className="user-glossy-button inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-2 rounded-xl px-3.5 text-[12px] font-bold text-[var(--theme-on-primary)] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
        >
          {isClaiming && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Collect referral income
        </button>
      </section>

      <section aria-label="Referral levels" className="space-y-2">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h2 className="font-display text-[17px] font-black leading-tight">Commission levels</h2>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-display text-[16px] font-black leading-none text-[var(--theme-primary)]">{activeMetric?.pct ?? 0}%</p>
            <p className="mt-1 text-[10px] text-[var(--theme-text)] opacity-55">{activeLevelStats.length} {activeLevelStats.length === 1 ? "invite" : "invites"}</p>
          </div>
        </div>
        <LevelTabs activeLevel={activeLevel} onChange={onActiveLevelChange} metrics={metrics} />
      </section>

      <section className="liquid-glass-panel divide-y divide-white/10 rounded-[22px] border border-white/10 px-3 backdrop-blur-[20px] backdrop-saturate-[180%]">
        {isLoading ? <ListSkeleton /> : activeLevelStats.length === 0 ? <EmptyState level={activeLevel} /> : (
          <AnimatePresence mode="wait">
            <motion.div key={`members-${activeLevel}`} initial={getInitial(reduced)} animate={{ opacity: 1, y: 0 }} exit={getExit(reduced)} transition={spring}>
              {activeLevelStats.map((stat, index) => <MemberRow key={`${stat.id || stat.phone || index}-${index}`} stat={stat} />)}
            </motion.div>
          </AnimatePresence>
        )}
      </section>
    </div>
  );
}
