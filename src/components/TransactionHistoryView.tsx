import React, { useState, useEffect, useMemo } from "react";
import { Loader2, CirclePlus, Wallet, ShoppingBag, TrendingUp, CalendarCheck, BadgeCheck, Gift, Link2, Trophy, SlidersHorizontal, Bell, type LucideIcon } from "lucide-react";
import { useCurrency } from "../currency";
import { asMetadataRecord, canonicalTypeOf, getTransactionDisplayMeta, isPositiveTransaction, getWithdrawalDisplayAmounts, isSuccessfulStatus } from "@/src/utils/transactionMeta";
import { fixGitHubImageUrl } from "@/src/utils/imageUtils";

interface Props {
  phone: string;
  siteConfig?: any;
  initialFilter?: string;
  onBack?: () => void;
}

const ICON_BY_CANON: Record<string, LucideIcon> = {
  deposit: CirclePlus,
  withdrawal: Wallet,
  product_activation: ShoppingBag,
  daily_yield: TrendingUp,
  daily_checkin_bonus: CalendarCheck,
  registration_bonus: BadgeCheck,
  gift_code: Gift,
  referral_signup_bonus: Link2,
  referral_level_income: Link2,
  vip_task: Trophy,
  admin_adjustment: SlidersHorizontal,
};

// Browsers can only render URL-like sources. Legacy ledger rows carry
// Tailwind gradient keys (e.g. "from-blue-600 ...") as product images —
// those must fall back to the bundled icon instead of a broken <img>.
const isUrlLike = (v: unknown) => {
  const s = String(v || "").trim().toLowerCase();
  return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:") || s.startsWith("/") || s.startsWith("blob:");
};

const firstRenderableImage = (...candidates: unknown[]) => {
  for (const candidate of candidates) {
    const image = fixGitHubImageUrl(String(candidate || "").trim());
    if (isUrlLike(image)) return image;
  }
  return "";
};

export default function TransactionHistoryView({ phone, siteConfig, initialFilter = "all", onBack }: Props) {
  const { formatCurrency } = useCurrency();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<string>(initialFilter);
  const [catalog, setCatalog] = useState<any[]>([]);

  const fetchTxHistory = async () => {
    setTxLoading(true);
    try {
      const res = await fetch(`/api/profile/transactions/${phone}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTxLoading(false);
    }
  };

  const fetchCatalog = async () => {
    try {
      const res = await fetch("/api/items");
      if (res.ok) {
        const data = await res.json();
        setCatalog(Array.isArray(data) ? data : data.items || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTxHistory();
  }, [phone]);

  useEffect(() => {
    fetchCatalog();
  }, []);

  const catalogById = useMemo(() => {
    const m = new Map<string, any>();
    for (const item of catalog) {
      if (item.id) m.set(String(item.id), item);
    }
    return m;
  }, [catalog]);

  const catalogByName = useMemo(() => {
    const m = new Map<string, unknown>();
    for (const c of catalog) if (c.name) m.set(String(c.name).toLowerCase(), c);
    return m;
  }, [catalog]);

  const getProductForTx = (tx: unknown, canon: string) => {
    if (canon !== "daily_yield") return null;
    const meta = asMetadataRecord((tx as { metadata?: unknown }).metadata);
    const directId = String((tx as { itemId?: unknown }).itemId || "").trim();
    const id = String(meta.sourceItemId || meta.subscriptionId || directId || "").trim();
    const lookupId = id || directId;
    if (lookupId) {
      const product = catalogById.get(lookupId);
      if (product) return product;
    }
    const name = String(meta.sourceItemName || "").trim().toLowerCase();
    if (name) {
      const byName = catalogByName.get(name);
      if (byName) return byName;
    }
    return null;
  };

  const filtered = useMemo(() => transactions.filter((tx) => {
    const canon = canonicalTypeOf(tx.type, tx.metadata) as string;
    if (canon === "product_activation") return false;
    const matchesFilter =
      historyFilter === "all" ? true :
      historyFilter === "deposit" ? canon === "deposit" :
      historyFilter === "withdraw" ? canon === "withdrawal" :
      historyFilter === "yield" ? canon === "daily_yield" :
      historyFilter === "checkin" ? canon === "daily_checkin_bonus" :
      historyFilter === "voucher" ? canon === "gift_code" :
      historyFilter === "referral" ? (canon === "referral_signup_bonus" || canon === "referral_level_income") :
      historyFilter === "referral_bonus" ? canon === "referral_signup_bonus" :
      historyFilter === "referral_level" ? canon === "referral_level_income" :
      historyFilter === "vip_task" ? canon === "vip_task" :
      historyFilter === "registration_bonus" ? canon === "registration_bonus" :
      true;
    return matchesFilter;
  }), [transactions, historyFilter]);

  const metric = useMemo(() => {
    const metricTabs: Record<string, { label: string; icon: LucideIcon }> = {
      all: { label: "Total volume", icon: TrendingUp },
      deposit: { label: "Total deposits", icon: CirclePlus },
      withdraw: { label: "Total withdrawals", icon: Wallet },
      yield: { label: "Chicken income", icon: TrendingUp },
      referral: { label: "Referral income", icon: Link2 },
      voucher: { label: "Gift code total", icon: Gift },
    };
    const tab = metricTabs[historyFilter] ?? metricTabs.all;

    const amount = transactions.reduce((sum, tx) => {
      if (!isSuccessfulStatus(String(tx.status || ""))) return sum;
      const canon = canonicalTypeOf(tx.type, tx.metadata) as string;
      if (canon === "product_activation") return sum;
      const matchesTab =
        historyFilter === "all" ||
        historyFilter === "deposit" && canon === "deposit" ||
        historyFilter === "withdraw" && canon === "withdrawal" ||
        historyFilter === "yield" && canon === "daily_yield" ||
        historyFilter === "referral" && (canon === "referral_signup_bonus" || canon === "referral_level_income") ||
        historyFilter === "voucher" && canon === "gift_code";
      if (!matchesTab) return sum;
      const value = canon === "withdrawal"
        ? getWithdrawalDisplayAmounts(tx).payout
        : Number(tx.amount) || 0;
      return sum + Math.abs(value);
    }, 0);

    return { ...tab, amount };
  }, [transactions, historyFilter]);

  const getMeta = (type: string, metadata?: any) => {
    const disp = getTransactionDisplayMeta(type, metadata);
    const canon = canonicalTypeOf(type, metadata) as string;
    return {
      label: disp.label,
      icon: ICON_BY_CANON[canon] ?? Bell,
      card: "border-0 bg-transparent",
      canon,
      isProductWithName: disp.isProductWithName,
      productName: disp.productName,
      isReferralLevel: disp.isReferralLevel,
      level: disp.level,
    };
  };

  return (
    <div className="transaction-history-view w-full flex-1 flex flex-col min-h-0 bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border-0 rounded-none p-0">
      <div className="flex items-center justify-center py-5 shrink-0">
        <h1 className="text-xl sm:text-2xl font-display font-black tracking-tight text-[var(--theme-text)]">Transaction History</h1>
     
      </div>

      <section aria-label={metric.label} className="shrink-0 px-1 pb-3">
        <div className="min-w-0 rounded-2xl border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)]/70 p-4">
          <div className="flex items-center gap-2 text-[var(--theme-primary)]">
            <metric.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <h2 className="text-xs sm:text-sm font-bold">{metric.label}</h2>
          </div>
          <p className="mt-2 truncate font-display text-xl sm:text-2xl font-black tabular-nums text-[var(--theme-text)]">{formatCurrency(metric.amount)}</p>
          <p className="mt-1 text-[11px] font-medium text-[var(--theme-text)] opacity-50">Successful transactions only</p>
        </div>
      </section>

      <div className="shrink-0 space-y-3 px-1 py-2 bg-transparent">
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2 -mx-1 px-1 border-b border-[var(--theme-card-border)]">
          {[
            { id: "all", label: "All" },
            { id: "deposit", label: "Deposit" },
            { id: "withdraw", label: "Withdraw" },
            { id: "yield", label: "Chicken income" },
            { id: "referral", label: "Referral income" },
            { id: "voucher", label: "Gift Code" },
          ].map(tab => (
            <button key={tab.id} onClick={() => setHistoryFilter(tab.id)} className={`px-4 py-2.5 relative text-sm tracking-wide shrink-0 rounded-full transition-colors cursor-pointer ${historyFilter===tab.id ? "font-bold text-[var(--theme-on-primary)] bg-[var(--theme-primary)]" : "font-semibold text-[var(--theme-text)] bg-[var(--theme-card-bg)] opacity-70 hover:opacity-100"}`}>{tab.label}</button>
          ))}
        </div>
      </div>

    
      <div className="flex-1 overflow-y-auto overscroll-contain space-y-2 pb-8 scrollbar-none min-h-0">
        {txLoading ? (
          <div className="bg-transparent border border-white/10 rounded-[20px] p-10 flex flex-col items-center gap-2 backdrop-blur-[0px]">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--theme-primary)]" />
            <span className="text-xs font-sans font-medium text-[var(--theme-text)] opacity-60">SYNCHRONIZING..</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <Bell className="w-9 h-9 text-[var(--theme-text)] opacity-35 mx-auto mb-3" aria-hidden="true" />
            <p className="text-xs font-sans font-semibold tracking-wide text-[var(--theme-text)]">No transactions</p>
            <p className="text-[11px] font-sans font-normal text-[var(--theme-text)] opacity-50 mt-1">Try a different filter or check back later.</p>
          </div>
        ) : (
          filtered.map(tx => {
            const meta = getMeta(tx.type, tx.metadata);
            const isPositive = isPositiveTransaction(tx.type, tx.metadata);
            const { fee, payout } = getWithdrawalDisplayAmounts(tx);
            const amount = meta.canon === "withdrawal" ? payout : (tx.amount||0);
            const showFee = meta.canon === "withdrawal" && fee>0;
            const level = meta.isReferralLevel ? meta.level : undefined;
            const txMetadata = asMetadataRecord(tx.metadata);

            const product = getProductForTx(tx, meta.canon);
            const catalogFallback = tx.itemId ? catalogById.get(String(tx.itemId)) : null;
            const productImage = firstRenderableImage(
              txMetadata.sourceItemImage,
              product?.imageUrl,
              product?.image,
              catalogFallback?.imageUrl,
              catalogFallback?.image
            );
            const productName = product?.name || catalogFallback?.name || String(txMetadata.sourceItemName || "").trim();
            const tierNameFromItem = String(tx.itemId || "").startsWith("tier:") ? String(tx.itemId).slice(5) : "";
            const tierName = String(txMetadata.tierName || txMetadata.category || tierNameFromItem).trim();
            const configuredTier = Object.entries(
              (siteConfig?.vipTierMeta || {}) as Record<string, { imageUrl?: string }>
            ).find(([name]) => name.trim().toLowerCase() === tierName.toLowerCase())?.[1];
            const tierImage = firstRenderableImage(txMetadata.tierImageUrl, configuredTier?.imageUrl);
            const milestoneImage = meta.canon === "vip_task" ? tierImage : "";
            const returnsImage = meta.canon === "daily_yield" ? productImage : "";
            const mappedImage = milestoneImage || returnsImage;

            const displayLabel = meta.canon === "daily_yield"
              ? `${productName || "Product"} Returns`
              : meta.canon === "vip_task"
                ? `${tierName || "Milestone"} Bonus`
                : meta.label;
            const TransactionIcon = meta.icon;

            return (
              <div key={tx.id} className={`rounded-[20px] border-0 p-4 flex items-center gap-3.5 bg-transparent ${meta.card}`}>
                <div className={`${mappedImage ? "w-12 h-12 rounded-2xl bg-white/5 p-1" : "w-12 h-12 rounded-2xl bg-[var(--theme-card-bg)]/60"} flex items-center justify-center shrink-0 overflow-hidden`}>
                  {mappedImage
                    ? <img src={mappedImage} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover rounded-xl" />
                    : <TransactionIcon className={`w-5 h-5 ${isPositive ? "text-[var(--theme-primary)]" : "text-[var(--theme-text)] opacity-70"}`} strokeWidth={1.8} aria-hidden="true" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[18px] font-sans font-bold tracking-tight text-[var(--theme-text)] leading-tight">{displayLabel}</span>
                    {level != null && <span className="text-[12px] font-sans font-semibold px-1.5 py-0.5 rounded-full bg-[var(--theme-primary)]/12 text-[var(--theme-primary)] border border-[var(--theme-primary)]/15">L{level}</span>}
                  </div>
                  <p className="text-[12px] font-sans font-normal text-[var(--theme-text)] opacity-50 truncate mt-1 leading-none">{new Date(tx.createdAt||tx.timestamp||Date.now()).toLocaleDateString()} {tx.operator ? `• ${tx.operator}` : ""}</p>
                  {showFee && <p className="text-[11px] font-sans font-normal text-[var(--theme-text)] opacity-45 mt-0.5">Fee {formatCurrency(fee)} • Payout {formatCurrency(payout)}</p>}
                </div>
                <div className="text-right shrink-0 flex flex-col justify-center">
                  <p className={`text-[18px] sm:text-base font-display font-black tracking-tight leading-tight ${isPositive?"text-[var(--theme-primary)]":"text-[var(--theme-text)]"}`}>{isPositive?"+":"-"} {formatCurrency(amount)}</p>
                  {siteConfig?.usdtRate && (tx.operator==="USDT"||String(tx.usdtAddress||"").startsWith("T")||String(tx.phone||"").startsWith("T")) && <p className="text-[12px] font-sans font-medium text-[var(--theme-primary)] mt-1">≈ ${(amount/ siteConfig.usdtRate).toFixed(2)}</p>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
