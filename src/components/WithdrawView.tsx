import React, { useState, useEffect, useRef } from "react";
import { useGatedInterval } from "../hooks/useGatedInterval";
import { UserProfile, SubscribedNode } from "../types";
import {
  Copy,
  AlertTriangle,
  CheckCircle2,
  Info,
  ArrowUpRight,
  LockKeyhole,
} from "lucide-react";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import { formatUgandaPhoneInput, isValidUgandaPhone } from "../utils/ugandaPhone";
import { formatIntegerAmount, handleIntegerAmountInput } from "../utils/amountInput";
import PaymentMethodSelect from "./PaymentMethodSelect";
import { Button } from "./ui/button";
import phoneInputIcon from "@/src/assets/svg/input-phone.svg";
import amountInputIcon from "@/src/assets/svg/input-corn-coins.svg";

interface WithdrawViewProps {
  userProfile: UserProfile;
  siteConfig?: any;
  activeNodes?: SubscribedNode[];
  onProfileUpdate: (p: UserProfile) => void;
}

export default function WithdrawView({
  userProfile,
  siteConfig,
  activeNodes = [],
  onProfileUpdate,
}: WithdrawViewProps) {
  const { formatCurrency } = useCurrency();

  const minimumWithdrawal =
    Number(siteConfig?.minimumWithdrawal) > 0 ? Math.floor(Number(siteConfig.minimumWithdrawal)) : 0;
  const maximumWithdrawal =
    Number(siteConfig?.maximumWithdrawal) > 0 ? Math.floor(Number(siteConfig.maximumWithdrawal)) : 0;
  const withdrawalMode = (siteConfig?.withdrawMode || siteConfig?.withdrawalMode || "automatic") as string;

  const [pointsToWithdraw, setPointsToWithdraw] = useState<number>(0);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawOperator, setWithdrawOperator] = useState<"MTN" | "Airtel" | "USDT">(
    (userProfile.operator as any) || "MTN"
  );
  const [withdrawalPhone, setWithdrawalPhone] = useState(userProfile.phone || "");
  const [usdtAddress, setUsdtAddress] = useState(userProfile.usdtAddress || "");
  const withdrawalPhoneDigits = withdrawalPhone.replace(/\D/g, "");
  const normalizedWithdrawalPhone = withdrawalPhoneDigits.startsWith("256")
    ? `0${withdrawalPhoneDigits.slice(3)}`
    : withdrawalPhoneDigits;
  const destinationIsValid = withdrawOperator === "USDT"
    ? usdtAddress.trim().length >= 10
    : isValidUgandaPhone(withdrawalPhone);
  const [paymentStatus, setPaymentStatus] = useState<"IDLE" | "PENDING" | "SUCCESSFUL" | "FAILED">("IDLE");
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [trackingUnavailable, setTrackingUnavailable] = useState(false);
  const [lastPayout, setLastPayout] = useState<number>(0);
  const [pollDelay, setPollDelay] = useState(3000);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setWithdrawalPhone(userProfile.phone || "");
    setUsdtAddress(userProfile.usdtAddress || "");
    setWithdrawOperator((userProfile.operator as any) || "MTN");
  }, [userProfile.id, userProfile.phone, userProfile.usdtAddress, userProfile.operator]);

  useEffect(() => {
    if (paymentStatus !== "PENDING" || !transactionId) {
      setPollDelay(3000);
      abortRef.current?.abort();
      return;
    }
    setPollDelay(3000);
  }, [paymentStatus, transactionId]);

  const refreshProfile = async () => {
    const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    if (data.profile) onProfileUpdate(data.profile);
  };

  const checkStatus = async () => {
    if (document.hidden || paymentStatus !== "PENDING" || !transactionId) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const response = await fetch("/api/payment/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trans_id: transactionId }),
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted || !response.ok) return;
      const data = await response.json();
      if (data.status === "SUCCESSFUL") {
        setPaymentStatus("SUCCESSFUL");
        if (data.profile) onProfileUpdate(data.profile);
        else await refreshProfile();
        toast.success("Withdrawal completed successfully.");
      } else if (data.status === "FAILED") {
        setPaymentStatus("FAILED");
        setErrorMsg(data.error || "The withdrawal failed. Any deducted balance has been returned.");
        if (data.profile) onProfileUpdate(data.profile);
        else await refreshProfile();
        toast.error("Withdrawal failed. Your balance has been updated.");
      } else {
        setPollDelay((delay) => delay === 3000 ? 5000 : 10000);
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") console.error("Error polling withdrawal status:", err);
    }
  };

  useGatedInterval(() => { void checkStatus(); }, pollDelay, {
    enabled: paymentStatus === "PENDING" && !!transactionId,
    visibilityGate: true,
  });

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeNodes || activeNodes.length === 0) {
      toast.error("Purchase a product before requesting a withdrawal.");
      return;
    }
    if (!Number.isInteger(pointsToWithdraw) || pointsToWithdraw < minimumWithdrawal) {
      toast.error(`The minimum withdrawal is ${formatCurrency(minimumWithdrawal)}.`);
      return;
    }
    if (maximumWithdrawal > 0 && pointsToWithdraw > maximumWithdrawal) {
      toast.error(`The maximum withdrawal is ${formatCurrency(maximumWithdrawal)}.`);
      return;
    }
    if (pointsToWithdraw > (userProfile.withdrawableBalance || 0)) {
      toast.error(`Your withdrawable balance is ${formatCurrency(userProfile.withdrawableBalance || 0)}.`);
      return;
    }
    if (withdrawOperator === "USDT") {
      if (!destinationIsValid) {
        toast.error("Enter a valid USDT wallet address.");
        return;
      }
    } else {
      if (!destinationIsValid) {
        toast.error("Enter a withdrawal phone number with 9 or 10 digits.");
        return;
      }
    }
    setIsWithdrawing(true);
    setErrorMsg("");
    setTrackingUnavailable(false);
    try {
      const res = await fetch("/api/payment/withdraw", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: userProfile.id,
          amount: pointsToWithdraw,
          operator: withdrawOperator,
          withdrawPhone: withdrawOperator === "USDT" ? usdtAddress : normalizedWithdrawalPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Withdrawal rejected.");
      onProfileUpdate(data.profile);
      setLastPayout(pointsToWithdraw);
      setTransactionId(data.transaction?.id || null);
      const canPoll = Boolean(data.transaction?.id);
      if (data.status === "FAILED") setErrorMsg(data.error || "The withdrawal failed. Your balance has been updated.");
      else if (data.status !== "SUCCESSFUL" && data.status !== "FAILED" && !canPoll) {
        setTrackingUnavailable(true);
        setErrorMsg("We received your request but could not get a tracking ID. Refresh your balance or contact support before trying again.");
      }
      setPaymentStatus(data.status === "SUCCESSFUL" ? "SUCCESSFUL" : data.status === "FAILED" || !canPoll ? "FAILED" : "PENDING");
      if (data.status === "FAILED") toast.error("Withdrawal failed. Your balance has been updated.");
      else if (!canPoll && data.status !== "SUCCESSFUL") {
        try { await refreshProfile(); } catch { /* Keep the tracking issue visible. */ }
        toast.error("We couldn’t track this withdrawal. Check your balance before trying again.");
      }
      else if (data.status === "SUCCESSFUL") toast.success("Withdrawal completed successfully.");
      else toast.success(data.mode === "manual" || withdrawOperator === "USDT"
        ? "Withdrawal request submitted. We’ll update you after review."
        : "Withdrawal request sent. Waiting for provider confirmation.");
      setPointsToWithdraw(0);
    } catch (err: any) {
      setPaymentStatus("IDLE");
      try { await refreshProfile(); } catch { /* Keep the original withdrawal error visible. */ }
      toast.error(err.message || "Something went wrong.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const feePct = Number(siteConfig?.withdrawFee || 0);
  const feeAmount = Math.floor(pointsToWithdraw * (feePct / 100));
  const payout = Math.max(0, pointsToWithdraw - feeAmount);
  const isManualPayout = withdrawalMode === "manual" || withdrawOperator === "USDT";
  const statusTitle = paymentStatus === "PENDING" ? "Withdrawal processing" : paymentStatus === "FAILED" ? trackingUnavailable ? "Unable to track withdrawal" : "Withdrawal failed" : "Withdrawal complete";
  const statusDescription = paymentStatus === "FAILED"
    ? errorMsg
    : paymentStatus === "PENDING"
    ? `${formatCurrency(lastPayout)} requested. ${isManualPayout ? "Awaiting admin approval." : "Waiting for provider confirmation."}`
    : "Your withdrawal is settled. Check your balance and destination for the final amount.";
  const statusLabel = trackingUnavailable ? "Unknown" : paymentStatus === "SUCCESSFUL" ? "Completed" : paymentStatus === "FAILED" ? "Failed" : "Pending";
  const statusColor = trackingUnavailable ? "text-[var(--theme-text)] opacity-60" : paymentStatus === "SUCCESSFUL" ? "text-emerald-600" : paymentStatus === "FAILED" ? "text-rose-600" : "text-amber-600";

  if (paymentStatus !== "IDLE") {
    return (
      <div className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] text-[var(--theme-text)] p-4 pt-4 space-y-4 select-none">

        <div className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-8 text-center space-y-5 shadow-sm">
          {paymentStatus === "PENDING" ? (
            <div className="payment-status-spinner mx-auto rounded-full" aria-hidden="true" />
          ) : paymentStatus === "FAILED" ? (
            <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-500"><AlertTriangle className="w-10 h-10" /></div>
          ) : (
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-500">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          )}
          <div className="space-y-1">
            <h3 className="font-black text-sm uppercase tracking-wide">{statusTitle}</h3>
            <p className="text-xs font-bold opacity-60 max-w-sm mx-auto leading-relaxed">
              {statusDescription}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] p-4 max-w-xs mx-auto text-left space-y-2 text-xs font-bold">
            <div className="flex justify-between">
              <span className="opacity-60">Requested</span>
              <span>{formatCurrency(lastPayout)}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-60">Status</span>
              <span className={statusColor}>{statusLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-60">Destination</span>
              <span className="text-[var(--theme-primary)] truncate ml-2">
                {withdrawOperator === "USDT" ? usdtAddress.slice(0, 12) + "…" : withdrawalPhone}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] text-[var(--theme-text)] space-y-3 select-none p-3 pt-0 sm:p-4 sm:pt-0">
      <div className="flex justify-end">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--theme-primary)]/20 bg-[var(--theme-primary)]/8 px-3 py-1.5 text-[11px] font-bold text-[var(--theme-primary)]">
          <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
          Secure
        </span>
      </div>

      <div className="liquid-glass-panel overflow-hidden rounded-[26px] border border-white/15 shadow-[0_14px_36px_color-mix(in_srgb,var(--theme-card-shadow)_22%,transparent)]">
        <div className="space-y-2 px-2.5 py-2.5 sm:px-3">
          <PaymentMethodSelect
            value={withdrawOperator === "USDT" ? "crypto" : "mobile-money"}
            usdtNetwork={siteConfig?.usdtNetwork || "TRC20"}
            label=""
            paymentImages={{ mtn: siteConfig?.mtnLogoUrl, airtel: siteConfig?.airtelLogoUrl, usdt: siteConfig?.usdtLogoUrl }}
            onChange={(channel) => setWithdrawOperator(channel === "crypto" ? "USDT" : (userProfile.operator as any) === "Airtel" ? "Airtel" : "MTN")}
          />
        </div>

        <form noValidate onSubmit={handleWithdrawal} className="flex flex-col gap-3 p-2.5 sm:p-3">
          <div className="space-y-1.5">
            <label htmlFor="withdraw-destination" className="text-[13px] font-sans font-semibold opacity-65">
              {withdrawOperator === "USDT" ? "USDT wallet address" : "Withdrawal phone number"}
            </label>
            <div className="relative">
              {withdrawOperator !== "USDT" && <img src={phoneInputIcon} alt="" className="pointer-events-none absolute left-3 top-1/2 z-10 h-5 w-5 -translate-y-1/2 object-contain" aria-hidden="true" />}
              <input
                id="withdraw-destination"
                name={withdrawOperator === "USDT" ? "usdtAddress" : "withdrawalPhone"}
                type={withdrawOperator === "USDT" ? "text" : "tel"}
                inputMode={withdrawOperator === "USDT" ? "text" : "tel"}
                autoComplete={withdrawOperator === "USDT" ? "off" : "tel"}
                required
                value={withdrawOperator === "USDT" ? usdtAddress : withdrawalPhone}
                onChange={(e) => {
                  if (withdrawOperator === "USDT") setUsdtAddress(e.target.value);
                  else setWithdrawalPhone(e.target.value);
                }}
                placeholder={withdrawOperator === "USDT" ? "Enter USDT wallet address" : "07"}
                onBlur={() => {
                  if (withdrawOperator !== "USDT") setWithdrawalPhone((value) => formatUgandaPhoneInput(value));
                }}
                aria-describedby={withdrawOperator === "USDT" ? undefined : "withdraw-phone-format"}
                aria-invalid={!destinationIsValid && (withdrawOperator === "USDT" ? usdtAddress.length > 0 : withdrawalPhone.length > 0)}
                className={`w-full ${withdrawOperator === "USDT" ? "px-3.5" : "pl-10 pr-3.5"} py-2.5 rounded-xl border border-white/20 bg-[var(--theme-card-bg)]/70 text-[14px] font-semibold text-[var(--theme-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] outline-none backdrop-blur-xl placeholder:font-medium placeholder:opacity-40 transition-all focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)]`}
              />
            </div>
            {withdrawOperator !== "USDT" && <span id="withdraw-phone-format" className="sr-only">Enter a Ugandan phone number, for example +256 7XX XXX XXX.</span>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="withdrawal-amount" className="text-[13px] font-sans font-semibold opacity-65">Amount (UGX)</label>
            <div className="relative">
              <img src={amountInputIcon} alt="" className="pointer-events-none absolute left-3 top-1/2 z-10 h-5 w-5 -translate-y-1/2 object-contain" aria-hidden="true" />
              <input
                id="withdrawal-amount"
                name="amount"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                required
                value={formatIntegerAmount(pointsToWithdraw)}
                onChange={(e) => handleIntegerAmountInput(e, setPointsToWithdraw)}
                aria-describedby="withdrawal-rules"
                aria-invalid={pointsToWithdraw > 0 && (!Number.isInteger(pointsToWithdraw) || pointsToWithdraw < minimumWithdrawal || (maximumWithdrawal > 0 && pointsToWithdraw > maximumWithdrawal) || pointsToWithdraw > (userProfile.withdrawableBalance || 0))}
                className="w-full rounded-xl border border-white/20 bg-[var(--theme-card-bg)]/70 py-2.5 pl-10 pr-20 text-[14px] font-semibold text-[var(--theme-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] outline-none backdrop-blur-xl placeholder:font-medium placeholder:opacity-40 transition-all focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)]"
              />
             
            </div>
          </div>

          <div className="space-y-2 rounded-2xl border border-white/20 bg-[var(--theme-card-bg)]/65 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] backdrop-blur-xl">
            <div className="flex justify-between text-sm font-black">
              <span>Final amount</span>
              <span>{formatCurrency(payout)}</span>
            </div>
            {withdrawOperator === "USDT" && (
              <>
                <div className="flex justify-between text-sm font-black text-emerald-600 border-t border-[var(--theme-card-border)]/50 pt-2">
                  <span>USDT payout</span>
                  <span>≈ ${(payout / (siteConfig?.usdtRate || 3700)).toFixed(2)} USDT</span>
                </div>
                <div className="flex justify-between text-[11px] opacity-60 font-bold">
                  <span>Rate</span>
                  <span>1 USDT = {formatCurrency(siteConfig?.usdtRate || 3700)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-xs opacity-60 font-bold">
              <span>Fee</span>
              <span>{formatCurrency(feeAmount)}</span>
            </div>
          </div>



          <div className="mt-1 space-y-2.5">
            <Button
              variant="primary"
              size="lg"
              type="submit"
              loading={isWithdrawing}
              disabled={
                !Number.isInteger(pointsToWithdraw) ||
                pointsToWithdraw < minimumWithdrawal ||
                (maximumWithdrawal > 0 && pointsToWithdraw > maximumWithdrawal) ||
                pointsToWithdraw > (userProfile.withdrawableBalance || 0) ||
                !activeNodes ||
                activeNodes.length === 0
              }
              className="w-full"
            >
              {!activeNodes || activeNodes.length === 0 ? <span>Hatch an egg first</span> : <span>Withdraw</span>}
            </Button>
            <p id="withdrawal-rules" className="flex items-start gap-2 text-[12px] font-sans font-medium leading-relaxed opacity-60">
              {activeNodes && activeNodes.length > 0 ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              )}
              <span>
                Minimum withdrawal is {formatCurrency(minimumWithdrawal)}{maximumWithdrawal > 0 ? `; maximum is ${formatCurrency(maximumWithdrawal)}` : ""}. {activeNodes && activeNodes.length > 0 ? "Your egg hatch has activated withdrawals." : "Hatch an egg to activate withdrawals."}
              </span>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
