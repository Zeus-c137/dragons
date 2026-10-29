import React, { useState, useEffect } from "react";
import { SubscriptionItem, UserProfile } from "../types";
import {
  Check,
  Cpu,
  Copy,
  LockKeyhole,
  InfoIcon,
  ChevronDown,
} from "lucide-react";
import { sileo } from "sileo";
import { notify } from "../lib/notify";
import { useCurrency } from "../currency";
import { formatUgandaPhoneInput, isValidUgandaPhone, normalizeUgandaPhone } from "../utils/ugandaPhone";
import { formatDecimalAmountText, formatIntegerAmount, handleDecimalAmountInput, handleIntegerAmountInput, parseDecimalAmountText } from "../utils/amountInput";
import { waitForPaymentResolution } from "../utils/paymentStatus";
import PaymentMethodSelect from "./PaymentMethodSelect";
import { Button } from "./ui/button";
import phoneInputIcon from "@/src/assets/svg/input-phone.svg";
import amountInputIcon from "@/src/assets/svg/input-corn-coins.svg";

interface DepositViewProps {
  userProfile: UserProfile;
  items: SubscriptionItem[];
  siteConfig?: any;
  onDepositSuccess: (newProfile: UserProfile) => void;
  onGpuSuccess: (newSub: any, CostAmount: number) => void;
  onNavigateToHistory: () => void;
  preselectedItem?: SubscriptionItem | null;
}

export default function DepositView({
  userProfile,
  items,
  siteConfig,
  onDepositSuccess,
  onGpuSuccess,
  onNavigateToHistory,
  preselectedItem = null,
}: DepositViewProps) {
  const [payType, setPayType] = useState<"balance" | "gpu">(preselectedItem ? "gpu" : "balance");
  const [selectedGpu, setSelectedGpu] = useState<SubscriptionItem | null>(preselectedItem);
  const [depositAmount, setDepositAmount] = useState<number>(20000);
  const { formatCurrency } = useCurrency();
  const [mobileNumber, setMobileNumber] = useState<string>(userProfile.phone || "");

  const config = {
    allowAutoDeposit: true,
    allowManualDeposit: false,
    mtnReceiverPhone: "",
    mtnReceiverName: "",
    airtelReceiverPhone: "",
    airtelReceiverName: "",
    usdtRate: 3700,
    ...siteConfig,
  };

  const autoEnabled = config.allowAutoDeposit !== false;
  const manualEnabled = config.allowManualDeposit === true;
  const minimumDeposit = Number(config.minimumDeposit) > 0 ? Math.floor(Number(config.minimumDeposit)) : 20_000;
  const maximumDeposit = Number(config.maximumDeposit) > 0 ? Math.floor(Number(config.maximumDeposit)) : 0;

  const getDepositLimitError = (amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return "Enter a valid deposit amount.";
    if (amount < minimumDeposit) return `Minimum deposit is ${formatCurrency(minimumDeposit)}.`;
    if (maximumDeposit > 0 && amount > maximumDeposit) return `Maximum deposit is ${formatCurrency(maximumDeposit)}.`;
    return "";
  };

  useEffect(() => {
    if (depositAmount === 20_000) setDepositAmount(minimumDeposit);
    if (manualAmount === 20_000) setManualAmount(minimumDeposit);
    if (parseDecimalAmountText(usdtAmountUSD) === 5.5 && Number(config.usdtRate) > 0) {
      setUsdtAmountUSD(formatDecimalAmountText((minimumDeposit / Number(config.usdtRate)).toFixed(2)));
    }
  }, [minimumDeposit, config.usdtRate]);

  const [depositMode, setDepositMode] = useState<"auto" | "manual" | "usdt">(
    autoEnabled ? "auto" : manualEnabled ? "manual" : "usdt"
  );
  const mobileMoneyEnabled = autoEnabled || manualEnabled;

  useEffect(() => {
    if (!mobileMoneyEnabled && depositMode !== "usdt") setDepositMode("usdt");
    else if (autoEnabled && depositMode === "manual" && !manualEnabled) setDepositMode("auto");
    else if (manualEnabled && depositMode === "auto" && !autoEnabled) setDepositMode("manual");
  }, [autoEnabled, manualEnabled, mobileMoneyEnabled, depositMode]);

  const [senderPhone, setSenderPhone] = useState(userProfile.phone || "");
  const [manualAmount, setManualAmount] = useState<number>(20000);
  const [usdtAmountUSD, setUsdtAmountUSD] = useState<string>("5.5");
  const [manualRef, setManualRef] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (preselectedItem) {
      setSelectedGpu(preselectedItem);
      setPayType("gpu");
    } else {
      setPayType("balance");
    }
  }, [preselectedItem]);

  const handleStartPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedDepositPhone = normalizeUgandaPhone(mobileNumber);
    if (!/^\d{9,10}$/.test(normalizedDepositPhone)) {
      sileo.error({ title: "Invalid phone number", description: "Enter a valid mobile money number." });
      return;
    }
    const finalAmount = payType === "gpu" ? selectedGpu?.amount || 0 : depositAmount;
    const limitError = getDepositLimitError(finalAmount);
    if (limitError) {
      sileo.error({ title: "Invalid amount", description: limitError });
      return;
    }
    setIsSubmitting(true);
    const operator = "MTN";
    let transactionResolved = false;
    let profileRefreshFailed = false;
    try {
      const result = await sileo.promise(
        async () => {
          const response = await fetch("/api/payment/deposit", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phone: userProfile.id,
              depositPhone: normalizedDepositPhone,
              amount: finalAmount,
              operator,
              type: payType === "balance" ? "deposit" : "product_activation",
              itemId: payType === "gpu" ? selectedGpu?.id : undefined,
            }),
          });
          const data = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(data?.error || "Payment dispatch failed.");
          }
          if (typeof data?.trans_id !== "string" || !data.trans_id) {
            throw new Error("The payment was submitted, but its transaction reference was missing.");
          }

          const status = await waitForPaymentResolution(data.trans_id, data);
          transactionResolved = true;
          if (status.status === "FAILED") {
            throw new Error(status.error || "Payment failed. Please try again or contact support.");
          }
          if (payType === "balance") {
            const settledProfile = status.profile as UserProfile | undefined;
            if (settledProfile?.id === userProfile.id && Number.isFinite(Number(settledProfile.points))) {
              onDepositSuccess(settledProfile);
            } else {
              try {
                const profileResponse = await fetch(`/api/profile/${encodeURIComponent(userProfile.id)}`, {
                  cache: "no-store",
                  credentials: "same-origin",
                });
                const profileData = await profileResponse.json().catch(() => null);
                if (
                  !profileResponse.ok ||
                  profileData?.id !== userProfile.id ||
                  !Number.isFinite(Number(profileData.points))
                ) {
                  throw new Error("The updated account balance could not be loaded.");
                }
                onDepositSuccess(profileData as UserProfile);
              } catch (profileError) {
                profileRefreshFailed = true;
                console.error("Payment confirmed, but the account balance could not be refreshed:", profileError);
              }
            }
          } else if (status.subscription) {
            onGpuSuccess(status.subscription, selectedGpu?.amount || 0);
          }
          return status;
        },
        {
          loading: {
            title: "Payment initiated",
            description: "Enter your mobile money PIN.",
          },
          success: () => ({
            title: "Payment confirmed",
            icon: (
              <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-600 text-white">
                <Check className="h-4 w-4" aria-hidden="true" />
              </span>
            ),
            description: profileRefreshFailed
              ? `${formatCurrency(finalAmount)} was confirmed, but your capital balance could not be refreshed. Check transaction history.`
              : payType === "gpu"
                ? `${formatCurrency(finalAmount)} payment confirmed. Your product is active.`
                : `${formatCurrency(finalAmount)} has been added to your capital.`,
          }),
          error: (error) => ({
            title: "Payment failed",
            description: error instanceof Error ? error.message : "We couldn’t confirm this payment.",
          }),
        }
      );
      if (result.status === "SUCCESSFUL") onNavigateToHistory();
    } catch (error) {
      console.error("Deposit flow failed:", error);
      if (transactionResolved) onNavigateToHistory();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (depositMode === "usdt" && !config.usdtAddress?.trim()) {
      sileo.error({ title: "USDT unavailable", description: "USDT deposits are not available right now." });
      return;
    }
    let phoneTrim = normalizeUgandaPhone(senderPhone);
    if (depositMode === "manual") {
      if (!/^\d{9,10}$/.test(phoneTrim)) {
        sileo.error({ title: "Invalid phone number", description: "Enter a valid 9 or 10 digit sender number." });
        return;
      }
    } else {
      phoneTrim = "USDT_TRANSFER";
    }
    const refTrim = manualRef.trim();
    if (!refTrim) {
      sileo.error({ title: "Transaction reference required", description: "Enter the transaction ID or hash to submit your payment." });
      return;
    }
    const finalAmount =
      payType === "gpu"
        ? selectedGpu?.amount || 0
        : depositMode === "usdt"
        ? parseDecimalAmountText(usdtAmountUSD) * config.usdtRate
        : manualAmount;
    const limitError = getDepositLimitError(finalAmount);
    if (limitError) {
      sileo.error({ title: "Invalid amount", description: limitError });
      return;
    }
    setIsSubmitting(true);
    let detectedOperator = depositMode === "usdt" ? "USDT" : "MTN";
    if (depositMode === "manual") {
      const normalizedPhone = phoneTrim;
      if (normalizedPhone.startsWith("070") || normalizedPhone.startsWith("075") || normalizedPhone.startsWith("074")) {
        detectedOperator = "Airtel";
      }
    }
    let transactionResolved = false;
    try {
      const result = await sileo.promise(
        async () => {
          const response = await fetch("/api/manual/deposit", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phone: userProfile.id,
              senderPhone: phoneTrim,
              amount: finalAmount,
              operator: detectedOperator,
              transId: refTrim,
              itemId: payType === "gpu" ? selectedGpu?.id : undefined,
            }),
          });
          const data = await response.json().catch(() => null);
          if (!response.ok) throw new Error(data?.error || "Proof submission failed.");
          if (typeof data?.trans_id !== "string" || !data.trans_id) {
            throw new Error("Your payment proof was submitted, but its transaction reference was missing.");
          }

          const status = await waitForPaymentResolution(data.trans_id, data);
          transactionResolved = true;
          if (status.status === "FAILED") {
            throw new Error(status.error || "Payment verification failed. Please check your transaction history.");
          }
          if (payType === "balance") {
            const settledProfile = status.profile as UserProfile | undefined;
            if (!settledProfile || settledProfile.id !== userProfile.id) {
              throw new Error("Payment confirmed, but your updated balance could not be loaded. Please check transaction history.");
            }
            onDepositSuccess(settledProfile);
          } else if (status.subscription) {
            onGpuSuccess(status.subscription, selectedGpu?.amount || 0);
          }
          return status;
        },
        {
          loading: {
            title: "Payment submitted",
            description: depositMode === "usdt"
              ? `Your ${config.usdtNetwork || "TRC20"} payment is awaiting verification.`
              : "Your payment proof is awaiting verification.",
          },
          success: () => ({
            title: "Payment confirmed",
            icon: (
              <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-600 text-white">
                <Check className="h-4 w-4" aria-hidden="true" />
              </span>
            ),
            description: payType === "gpu"
              ? `${formatCurrency(finalAmount)} payment confirmed. Your product is active.`
              : `${formatCurrency(finalAmount)} has been added to your capital.`,
          }),
          error: (error) => ({
            title: "Payment verification failed",
            description: error instanceof Error ? error.message : "We couldn’t verify this payment.",
          }),
        }
      );
      if (result.status === "SUCCESSFUL") onNavigateToHistory();
    } catch (error) {
      console.error("Manual deposit flow failed:", error);
      if (transactionResolved) onNavigateToHistory();
    } finally {
      setIsSubmitting(false);
    }
  };

  const finalAmount =
    depositMode === "usdt"
      ? payType === "gpu"
        ? selectedGpu?.amount || 0
        : parseDecimalAmountText(usdtAmountUSD) * config.usdtRate
      : depositMode === "manual"
      ? payType === "gpu"
        ? selectedGpu?.amount || 0
        : manualAmount
      : payType === "gpu"
      ? selectedGpu?.amount || 0
      : depositAmount;
  const productIsValid = payType !== "gpu" || Boolean(selectedGpu?.id && Number(selectedGpu.amount) > 0);
  const amountIsValid = !getDepositLimitError(finalAmount);
  const normalizedSenderPhone = normalizeUgandaPhone(senderPhone);
  const manualPhoneIsValid = isValidUgandaPhone(senderPhone);
  const autoDepositIsValid = isValidUgandaPhone(mobileNumber) && amountIsValid && productIsValid;
  const manualDepositIsValid =
    manualPhoneIsValid && Boolean(manualRef.trim()) && amountIsValid && productIsValid;
  const usdtDepositIsValid = Boolean(config.usdtAddress?.trim()) && Boolean(manualRef.trim()) && amountIsValid && productIsValid;

  return (
    <div className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] text-[var(--theme-text)] space-y-3 select-none p-3 pt-0 sm:p-4 sm:pt-0">
      <div className="flex justify-end">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--theme-primary)]/20 bg-[var(--theme-primary)]/8 px-3 py-1.5 text-[11px] font-bold text-[var(--theme-accent)]">
          <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
          Secure
        </span>
      </div>
      {/* Optional product details */}
      <div className="">


        {/* Selected product strip — theme-aware */}
        {payType === "gpu" && selectedGpu && (
          <div className="flex items-center gap-3 p-3 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] shadow-sm">
            <div className="w-12 h-12 rounded-xl overflow-hidden border border-[var(--theme-card-border)] bg-[var(--theme-bg)] shrink-0">
              {selectedGpu.imageUrl ? (
                <img src={selectedGpu.imageUrl} alt={selectedGpu.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[var(--theme-accent)] opacity-60">
                  <Cpu className="w-6 h-6" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-sans font-medium opacity-60 leading-none">Paying for</p>
              <p className="text-[15px] font-sans font-extrabold leading-tight truncate mt-1">{selectedGpu.name}</p>
              <p className="text-[11px] font-bold text-[var(--theme-accent)] leading-none mt-1">
                Earns {formatCurrency(selectedGpu.dailyYield)}/day • {selectedGpu.duration} days
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[12px] font-sans font-medium opacity-60">Price</p>
              <p className="text-sm font-black text-[var(--theme-accent)]">{formatCurrency(selectedGpu.amount)}</p>
            </div>
          </div>
        )}

      </div>

      <div className="liquid-glass-panel overflow-hidden rounded-[26px] border border-white/15 shadow-[0_14px_36px_color-mix(in_srgb,var(--theme-card-shadow)_22%,transparent)]">
          {/* Payment method dropdown */}
          <div className="space-y-2 px-2.5 py-2.5 sm:px-3">
            <PaymentMethodSelect
              value={depositMode === "usdt" ? "crypto" : "mobile-money"}
              usdtNetwork={config.usdtNetwork || "TRC20"}
              mobileMoneyDisabled={!mobileMoneyEnabled}
              paymentImages={{ mtn: config.mtnLogoUrl, airtel: config.airtelLogoUrl, usdt: config.usdtLogoUrl }}
              onChange={(channel) => {
                setDepositMode(channel === "crypto" ? "usdt" : autoEnabled ? "auto" : "manual");
              }}
            />
            {depositMode !== "usdt" && autoEnabled && manualEnabled ? (
              <div className="space-y-1">
                <label htmlFor="mobile-money-deposit-mode" className="text-xs font-semibold text-[var(--theme-text)] opacity-60">Mobile Money option</label>
                <div className="relative">
                  <select
                    id="mobile-money-deposit-mode"
                    value={depositMode}
                    onChange={(event) => setDepositMode(event.target.value as "auto" | "manual")}
                    className="w-full appearance-none rounded-xl border border-white/20 bg-[var(--theme-card-bg)]/70 px-3.5 py-2.5 pr-10 text-[13px] font-semibold text-[var(--theme-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] outline-none backdrop-blur-xl focus:border-[var(--theme-primary)] focus:ring-2 focus:ring-[var(--theme-primary)]/20"
                  >
                    <option value="auto">Instant mobile payment</option>
                    <option value="manual">Manual transfer</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" aria-hidden="true" />
                </div>
              </div>
            ) : null}
          </div>

          {/* Forms */}
          <div className="space-y-3 p-2.5 sm:p-3">
            {depositMode === "auto" && (
              <form noValidate onSubmit={handleStartPayment} className="flex flex-col gap-3">
                <div className="space-y-2.5">
                  <div className="space-y-1.5">
                    <label htmlFor="deposit-mobile-number" className="text-[13px] font-sans font-semibold opacity-65">Phone number</label>
                    <div className="relative">
                      <img src={phoneInputIcon} alt="" className="pointer-events-none absolute left-3 top-1/2 z-10 h-5 w-5 -translate-y-1/2 object-contain" aria-hidden="true" />
                      <input
                        id="deposit-mobile-number"
                        name="mobileNumber"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        required
                        placeholder="07"
                        value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value)}
                        onBlur={() => setMobileNumber((value) => formatUgandaPhoneInput(value))}
                        aria-describedby="deposit-mobile-number-format"
                        aria-invalid={mobileNumber.length > 0 && !isValidUgandaPhone(mobileNumber)}
                        className="w-full rounded-xl border border-white/20 bg-[var(--theme-card-bg)]/70 py-2.5 pl-10 pr-3.5 text-[14px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] outline-none backdrop-blur-xl transition-colors placeholder:font-medium placeholder:opacity-40 focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)]"
                      />
                    </div>
                    <span id="deposit-mobile-number-format" className="sr-only">Enter a Ugandan mobile money number, including the country code +256.</span>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="deposit-amount" className="text-[13px] font-sans font-semibold opacity-65">Amount (UGX)</label>
                    <div className="relative">
                      <img src={amountInputIcon} alt="" className="pointer-events-none absolute left-3 top-1/2 z-10 h-5 w-5 -translate-y-1/2 object-contain" aria-hidden="true" />
                      <input
                        id="deposit-amount"
                        name="amount"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        required
                        disabled={payType === "gpu"}
                        aria-describedby="deposit-amount-rules"
                        aria-invalid={!amountIsValid}
                        value={payType === "gpu" ? formatIntegerAmount(selectedGpu?.amount || 0) : formatIntegerAmount(depositAmount)}
                        onChange={(e) => handleIntegerAmountInput(e, setDepositAmount)}
                        className="w-full rounded-xl border border-white/20 bg-[var(--theme-card-bg)]/70 py-2.5 pl-10 pr-3.5 text-[14px] font-black shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] outline-none backdrop-blur-xl transition-colors focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] disabled:opacity-60"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-1 space-y-2.5">
                  <Button
                    variant="primary"
                    size="md"
                    type="submit"
                    loading={isSubmitting}
                    disabled={!autoDepositIsValid || isSubmitting}
                    className="w-full"
                  >
                    <span>Deposit</span>
                  </Button>
                  <p id="deposit-amount-rules" className="flex items-start gap-2 text-[12px] font-sans font-medium leading-relaxed opacity-60">
                    <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Minimum deposit is {formatCurrency(minimumDeposit)}. The funds reflect in your account instantly.</span>
                  </p>
                </div>
              </form>
            )}

            {depositMode === "manual" && (
              <form noValidate onSubmit={handleStartManualPayment} className="flex flex-col gap-3">
                {/* Receiver cards */}
                  <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {config.mtnReceiverPhone ? (
                      <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/15 bg-[var(--theme-card-bg)]/65 p-2.5 shadow-sm backdrop-blur-xl">
                        <div className="flex items-center gap-2 min-w-0">
                          {config.mtnLogoUrl ? (
                            <img src={config.mtnLogoUrl} alt="MTN" className="w-8 h-8 rounded-full bg-white p-1 object-contain border border-[var(--theme-card-border)] shrink-0" />
                          ) : (
                            <span className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-black shrink-0">MTN</span>
                          )}
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 leading-none">MTN Uganda</p>
                            <p className="text-sm font-black leading-none mt-1 select-all truncate">{config.mtnReceiverPhone}</p>
                            <p className="text-[11px] font-bold opacity-60 truncate">{config.mtnReceiverName || "PJNATAL"}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(config.mtnReceiverPhone);
                            notify("success", "MTN number copied");
                          }}
                          className="shrink-0 w-8 h-8 rounded-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] flex items-center justify-center hover:border-[var(--theme-primary)]/30 transition-colors cursor-pointer"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-[var(--theme-radius)] bg-[var(--theme-bg)] border border-dashed border-[var(--theme-card-border)] p-3 text-xs font-bold opacity-50">MTN offline</div>
                    )}
                    {config.airtelReceiverPhone ? (
                      <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/15 bg-[var(--theme-card-bg)]/65 p-2.5 shadow-sm backdrop-blur-xl">
                        <div className="flex items-center gap-2 min-w-0">
                          {config.airtelLogoUrl ? (
                            <img src={config.airtelLogoUrl} alt="Airtel" className="w-8 h-8 rounded-full bg-white p-1 object-contain border border-[var(--theme-card-border)] shrink-0" />
                          ) : (
                            <span className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px] font-black shrink-0">AT</span>
                          )}
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-wider text-rose-600 leading-none">Airtel Money</p>
                            <p className="text-sm font-black leading-none mt-1 select-all truncate">{config.airtelReceiverPhone}</p>
                            <p className="text-[11px] font-bold opacity-60 truncate">{config.airtelReceiverName || "PJNATAL"}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(config.airtelReceiverPhone);
                            notify("success", "Airtel number copied");
                          }}
                          className="shrink-0 w-8 h-8 rounded-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] flex items-center justify-center hover:border-[var(--theme-primary)]/30 transition-colors cursor-pointer"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-[var(--theme-radius)] bg-[var(--theme-bg)] border border-dashed border-[var(--theme-card-border)] p-3 text-xs font-bold opacity-50">Airtel offline</div>
                    )}
                  </div>
                  <div className="rounded-full bg-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/20 px-3 py-2 flex items-center justify-between gap-2 text-xs font-black">
                    <span className="opacity-70">Exact amount</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[var(--theme-accent)]">{formatCurrency(finalAmount)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(String(finalAmount));
                          notify("success", "Amount copied");
                        }}
                        className="w-7 h-7 rounded-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] flex items-center justify-center cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="space-y-1.5">
                    <label htmlFor="manual-sender-number" className="text-[13px] font-sans font-semibold opacity-65">Your sender number</label>
                    <div className="relative">
                      <img src={phoneInputIcon} alt="" className="pointer-events-none absolute left-3 top-1/2 z-10 h-5 w-5 -translate-y-1/2 object-contain" aria-hidden="true" />
                      <input
                        id="manual-sender-number"
                        name="senderPhone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        required
                        placeholder="07"
                        value={senderPhone}
                        onChange={(e) => setSenderPhone(e.target.value)}
                        onBlur={() => setSenderPhone((value) => formatUgandaPhoneInput(value))}
                        aria-describedby="manual-sender-number-format"
                        aria-invalid={senderPhone.length > 0 && !manualPhoneIsValid}
                        className="w-full rounded-xl border border-white/20 bg-[var(--theme-card-bg)]/70 py-2.5 pl-10 pr-3.5 text-[14px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] outline-none backdrop-blur-xl placeholder:font-medium placeholder:opacity-40 focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)]"
                      />
                    </div>
                    <span id="manual-sender-number-format" className="sr-only">Enter a mobile number in international format, for example +256 7XX XXX XXX.</span>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="manual-deposit-amount" className="text-[13px] font-sans font-semibold opacity-65">Amount sent (UGX)</label>
                    <div className="relative">
                      <img src={amountInputIcon} alt="" className="pointer-events-none absolute left-3 top-1/2 z-10 h-5 w-5 -translate-y-1/2 object-contain" aria-hidden="true" />
                      <input
                        id="manual-deposit-amount"
                        name="amount"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        required
                        disabled={payType === "gpu"}
                        aria-describedby="manual-deposit-amount-rules"
                        aria-invalid={!amountIsValid}
                        value={payType === "gpu" ? formatIntegerAmount(selectedGpu?.amount || 0) : formatIntegerAmount(manualAmount)}
                        onChange={(e) => handleIntegerAmountInput(e, setManualAmount)}
                        className="w-full rounded-xl border border-white/20 bg-[var(--theme-card-bg)]/70 py-2.5 pl-10 pr-3.5 text-[14px] font-black shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] outline-none backdrop-blur-xl focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] disabled:opacity-60"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="manual-deposit-reference" className="text-[13px] font-sans font-semibold opacity-65">Transaction ID</label>
                    <input
                      id="manual-deposit-reference"
                      name="transactionId"
                      type="text"
                      required
                      autoComplete="off"
                      placeholder="Paste mobile money TxID"
                      value={manualRef}
                      onChange={(e) => setManualRef(e.target.value)}
                      className="w-full rounded-xl border border-white/20 bg-[var(--theme-card-bg)]/70 px-3.5 py-2.5 text-[14px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] outline-none backdrop-blur-xl placeholder:font-medium placeholder:opacity-40 focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)]"
                    />
                  </div>
                </div>

                <div className="mt-1 space-y-2.5">
                  <Button
                    variant="primary"
                    size="lg"
                    type="submit"
                    loading={isSubmitting}
                    disabled={!manualDepositIsValid || isSubmitting}
                    className="w-full"
                  >
                    <span>Submit proof • {formatCurrency(finalAmount)}</span>
                  </Button>
                  <p id="manual-deposit-amount-rules" className="text-center text-xs font-sans font-medium opacity-60">
                    {formatCurrency(minimumDeposit)} min{maximumDeposit > 0 ? ` • ${formatCurrency(maximumDeposit)} max` : " • no max"}
                  </p>
                </div>
              </form>
            )}

            {depositMode === "usdt" && (
              <form noValidate onSubmit={handleStartManualPayment} className="flex flex-col gap-3">
                {/* Step 1 — QR + wallet */}
                <div className="space-y-3">
                  <p className="text-[15px] font-sans font-extrabold tracking-tight">Send USDT</p>
                  <div className="space-y-3 p-2.5 sm:p-3">
                    {config.usdtQrUrl && (
                      <div className="flex justify-center">
                        <div className="h-40 w-40 overflow-hidden rounded-2xl border border-white/40 bg-white p-2.5 shadow-lg sm:h-44 sm:w-44">
                          <img src={config.usdtQrUrl} alt="USDT QR" className="w-full h-full object-contain" />
                        </div>
                      </div>
                    )}
                    <div className="text-center space-y-1">
                      <p className="text-xl font-display font-black text-[var(--theme-accent)] tracking-tight leading-none">{formatCurrency(finalAmount)}</p>
                      {config.usdtRate ? <p className="text-[11px] font-semibold opacity-60">≈ ${(finalAmount / config.usdtRate).toFixed(2)}</p> : null}
                    </div>
                    <div className="rounded-xl bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-3.5 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#26A17B] text-white flex items-center justify-center shrink-0 text-sm font-black">₮</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-sans font-medium opacity-60 leading-none">{config.usdtNetwork || "USDT TRC20"} address</p>
                        <p className="text-[13px] font-semibold select-all truncate mt-1.5 font-mono">{config.usdtAddress || "Wallet not configured"}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (config.usdtAddress) {
                            navigator.clipboard.writeText(config.usdtAddress);
                            notify("success", "Wallet copied");
                          }
                        }}
                        className="shrink-0 w-9 h-9 rounded-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] flex items-center justify-center hover:border-[var(--theme-primary)]/30 transition-colors cursor-pointer"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="space-y-1.5">
                    <label htmlFor="usdt-deposit-amount" className="text-[13px] font-sans font-semibold opacity-65">Amount sent (USD)</label>
                    <div className="relative">
                      <img src={amountInputIcon} alt="" className="pointer-events-none absolute left-3 top-1/2 z-10 h-5 w-5 -translate-y-1/2 object-contain" aria-hidden="true" />
                      <input
                        id="usdt-deposit-amount"
                        name="amountUsd"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        required
                        disabled={payType === "gpu"}
                        aria-describedby="usdt-deposit-amount-rules"
                        aria-invalid={!amountIsValid}
                        value={payType === "gpu" ? formatDecimalAmountText(((selectedGpu?.amount || 0) / (config.usdtRate || 3700)).toFixed(2)) : usdtAmountUSD}
                        onChange={(e) => handleDecimalAmountInput(e, setUsdtAmountUSD)}
                        className="w-full rounded-xl border border-white/20 bg-[var(--theme-card-bg)]/70 py-2.5 pl-10 pr-3.5 text-[14px] font-black shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] outline-none backdrop-blur-xl focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] disabled:opacity-60"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="usdt-deposit-reference" className="text-[13px] font-sans font-semibold opacity-65">Transaction Hash</label>
                    <input
                      id="usdt-deposit-reference"
                      name="transactionHash"
                      type="text"
                      required
                      autoComplete="off"
                      value={manualRef}
                      onChange={(e) => setManualRef(e.target.value)}
                      className="w-full rounded-xl border border-white/20 bg-[var(--theme-card-bg)]/70 px-3.5 py-2.5 text-[14px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] outline-none backdrop-blur-xl placeholder:font-medium placeholder:opacity-40 focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)]"
                    />
                  </div>
                </div>

                <div className="mt-1 space-y-2.5">
                  <Button
                    variant="primary"
                    size="lg"
                    type="submit"
                    loading={isSubmitting}
                    disabled={!usdtDepositIsValid || isSubmitting}
                    className="w-full"
                  >
                    <span>Submit USDT proof</span>
                  </Button>
                  <p id="usdt-deposit-amount-rules" className="flex items-start gap-2 text-[12px] font-sans font-medium leading-relaxed opacity-60">
                    <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Minimum deposit is {formatCurrency(minimumDeposit)}. Send at least this amount to your wallet.</span>
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
    </div>
  );
}
