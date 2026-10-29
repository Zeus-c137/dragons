import React, { useState, useEffect } from "react";
import { UserProfile, SubscribedNode } from "../types";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  LockKeyhole,
} from "lucide-react";
import { notify } from "../lib/notify";
import { sileo } from "sileo";
import { useCurrency } from "../currency";
import { formatUgandaPhoneInput, isValidUgandaPhone } from "../utils/ugandaPhone";
import { formatIntegerAmount, handleIntegerAmountInput } from "../utils/amountInput";
import { waitForPaymentResolution } from "../utils/paymentStatus";
import PaymentMethodSelect from "./PaymentMethodSelect";
import { Button } from "./ui/button";
import phoneInputIcon from "@/src/assets/svg/input-phone.svg";
import amountInputIcon from "@/src/assets/svg/input-corn-coins.svg";

interface WithdrawViewProps {
  userProfile: UserProfile;
  siteConfig?: any;
  activeNodes?: SubscribedNode[];
  onProfileUpdate: (p: UserProfile) => void;
  onNavigateToHistory: () => void;
}

export default function WithdrawView({
  userProfile,
  siteConfig,
  activeNodes = [],
  onProfileUpdate,
  onNavigateToHistory,
}: WithdrawViewProps) {
  const { formatCurrency } = useCurrency();

  const minimumWithdrawal =
    Number(siteConfig?.minimumWithdrawal) > 0 ? Math.floor(Number(siteConfig.minimumWithdrawal)) : 0;
  const maximumWithdrawal =
    Number(siteConfig?.maximumWithdrawal) > 0 ? Math.floor(Number(siteConfig.maximumWithdrawal)) : 0;
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
  useEffect(() => {
    setWithdrawalPhone(userProfile.phone || "");
    setUsdtAddress(userProfile.usdtAddress || "");
    setWithdrawOperator((userProfile.operator as any) || "MTN");
  }, [userProfile.id, userProfile.phone, userProfile.usdtAddress, userProfile.operator]);

  const refreshProfile = async () => {
    const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (
      !response.ok ||
      !data?.profile ||
      data.profile.id !== userProfile.id ||
      !Number.isFinite(Number(data.profile.points))
    ) {
      throw new Error(data?.error || "Your updated balance could not be loaded.");
    }
    return data.profile as UserProfile;
  };

  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeNodes || activeNodes.length === 0) {
      notify("error", "Purchase a product before requesting a withdrawal.");
      return;
    }
    if (!Number.isInteger(pointsToWithdraw) || pointsToWithdraw < minimumWithdrawal) {
      notify("error", `The minimum withdrawal is ${formatCurrency(minimumWithdrawal)}.`);
      return;
    }
    if (maximumWithdrawal > 0 && pointsToWithdraw > maximumWithdrawal) {
      notify("error", `The maximum withdrawal is ${formatCurrency(maximumWithdrawal)}.`);
      return;
    }
    if (pointsToWithdraw > (userProfile.withdrawableBalance || 0)) {
      notify("error", `Your withdrawable balance is ${formatCurrency(userProfile.withdrawableBalance || 0)}.`);
      return;
    }
    if (withdrawOperator === "USDT") {
      if (!destinationIsValid) {
        notify("error", "Enter a valid USDT wallet address.");
        return;
      }
    } else {
      if (!destinationIsValid) {
        notify("error", "Enter a withdrawal phone number with 9 or 10 digits.");
        return;
      }
    }
    setIsWithdrawing(true);
    const withdrawalAmount = pointsToWithdraw;
    const destination = withdrawOperator === "USDT" ? usdtAddress.trim() : normalizedWithdrawalPhone;
    const feeAmount = Math.floor(withdrawalAmount * (Number(siteConfig?.withdrawFee || 0) / 100));
    const payoutAmount = Math.max(0, withdrawalAmount - feeAmount);
    let transactionResolved = false;
    try {
      const result = await sileo.promise(
        async () => {
          const response = await fetch("/api/payment/withdraw", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phone: userProfile.id,
              amount: withdrawalAmount,
              operator: withdrawOperator,
              withdrawPhone: destination,
            }),
          });
          const data = await response.json().catch(() => null);
          if (!response.ok) {
            let failureMessage = data?.error || "Withdrawal rejected.";
            try {
              onProfileUpdate(await refreshProfile());
            } catch (profileError) {
              console.error("Could not refresh the balance after withdrawal request failure:", profileError);
              failureMessage += " Your balance could not be refreshed; please reload your account.";
            }
            throw new Error(failureMessage);
          }

          const initialStatus = String(data?.status || "PENDING").toUpperCase();
          const transactionId = data?.transaction?.id;
          if (initialStatus !== "SUCCESSFUL" && initialStatus !== "FAILED" && typeof transactionId !== "string") {
            throw new Error("The withdrawal was submitted, but its tracking reference was missing.");
          }
          if (data?.profile?.id === userProfile.id) {
            onProfileUpdate(data.profile);
          }

          const status = initialStatus === "SUCCESSFUL" || initialStatus === "FAILED"
            ? { ...data, status: initialStatus }
            : await waitForPaymentResolution(transactionId, data);
          transactionResolved = true;

          if (status.status === "FAILED") {
            let failureMessage = status.error || "The withdrawal failed. Any deducted balance has been returned.";
            try {
              onProfileUpdate(await refreshProfile());
            } catch (profileError) {
              console.error("Could not refresh the balance after withdrawal failure:", profileError);
              failureMessage += " Your balance could not be refreshed; please reload your account.";
            }
            throw new Error(failureMessage);
          }
          if (status.profile?.id === userProfile.id) {
            onProfileUpdate(status.profile);
          }
          setPointsToWithdraw(0);
          return status;
        },
        {
          loading: {
            title: "Withdrawal initiated",
            description: "Your withdrawal request is processing.",
          },
          success: () => ({
            title: "Withdrawal successful",
            icon: (
              <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-600 text-white">
                <Check className="h-4 w-4" aria-hidden="true" />
              </span>
            ),
            description: `${formatCurrency(payoutAmount)} has been sent to ${destination}.`,
          }),
          error: (error) => ({
            title: "Withdrawal failed",
            description: error instanceof Error ? error.message : "The withdrawal could not be completed.",
          }),
        }
      );
      if (result.status === "SUCCESSFUL") onNavigateToHistory();
    } catch (error) {
      console.error("Withdrawal flow failed:", error);
      if (transactionResolved) onNavigateToHistory();
    } finally {
      setIsWithdrawing(false);
    }
  };

  const feePct = Number(siteConfig?.withdrawFee || 0);
  const feeAmount = Math.floor(pointsToWithdraw * (feePct / 100));
  const payout = Math.max(0, pointsToWithdraw - feeAmount);
  return (
    <div className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] text-[var(--theme-text)] space-y-3 select-none p-3 pt-0 sm:p-4 sm:pt-0">
      <div className="flex justify-end">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--theme-primary)]/20 bg-[var(--theme-primary)]/8 px-3 py-1.5 text-[11px] font-bold text-[var(--theme-accent)]">
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
