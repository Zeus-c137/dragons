import React, { useState, useEffect, useRef } from "react";
import { useGatedInterval } from "../hooks/useGatedInterval";
import { SubscriptionItem, UserProfile } from "../types";
import {
  PhoneCall,
  Coins,
  CheckCircle,
  Cpu,
  Copy,
  ShieldCheck,
  Clock,
  BadgeInfo,
  InfoIcon,
  ChevronDown,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import { formatUgandaPhoneInput, isValidUgandaPhone, normalizeUgandaPhone } from "../utils/ugandaPhone";
import PaymentMethodSelect from "./PaymentMethodSelect";
import { Button } from "./ui/button";

interface DepositViewProps {
  userProfile: UserProfile;
  items: SubscriptionItem[];
  siteConfig?: any;
  onDepositSuccess: (newProfile: UserProfile) => void;
  onGpuSuccess: (newSub: any, CostAmount: number) => void;
  preselectedItem?: SubscriptionItem | null;
}

export default function DepositView({
  userProfile,
  items,
  siteConfig,
  onDepositSuccess,
  onGpuSuccess,
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
    if (usdtAmountUSD === 5.5 && Number(config.usdtRate) > 0) {
      setUsdtAmountUSD(Number((minimumDeposit / Number(config.usdtRate)).toFixed(2)));
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
  const [usdtAmountUSD, setUsdtAmountUSD] = useState<number>(5.5);
  const [manualRef, setManualRef] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [currentTransId, setCurrentTransId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"IDLE" | "PENDING" | "SUCCESSFUL" | "FAILED">("IDLE");
  const handledSuccessTransIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (preselectedItem) {
      setSelectedGpu(preselectedItem);
      setPayType("gpu");
    } else {
      setPayType("balance");
    }
  }, [preselectedItem]);

  const backoffRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const BACKOFF = [3000, 5000, 10000] as const;
  const getBackoff = () => BACKOFF[Math.min(backoffRef.current, 2)];

  useEffect(() => {
    if (paymentStatus !== "PENDING" || !currentTransId) {
      backoffRef.current = 0;
      if (abortRef.current) abortRef.current.abort();
      return;
    }
    backoffRef.current = 0;
  }, [paymentStatus, currentTransId]);

  const checkStatus = async () => {
    if (document.hidden) return;
    if (paymentStatus !== "PENDING" || !currentTransId) return;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/payment/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trans_id: currentTransId }),
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      if (res.ok) {
        const data = await res.json();
        if (data.status === "SUCCESSFUL") {
          if (handledSuccessTransIdRef.current === currentTransId) return;
          handledSuccessTransIdRef.current = currentTransId;
          let settledProfile = data.profile as UserProfile | undefined;
          if (payType === "balance" && !settledProfile) {
            const profileResponse = await fetch(`/api/profile/${encodeURIComponent(userProfile.id)}`, {
              cache: "no-store",
              credentials: "same-origin",
              signal: ctrl.signal,
            });
            if (!profileResponse.ok) {
              throw new Error("Payment is confirmed, but your updated balance could not be loaded. Please refresh your account.");
            }
            const profileData = await profileResponse.json();
            if (profileData?.id !== userProfile.id || !Number.isFinite(Number(profileData.points))) {
              throw new Error("Payment is confirmed, but your updated balance could not be loaded. Please refresh your account.");
            }
            settledProfile = profileData;
          }
          if (ctrl.signal.aborted) return;
          if (payType === "balance" && (!settledProfile || settledProfile.id !== userProfile.id)) {
            throw new Error("Payment is confirmed, but your account balance could not be refreshed.");
          }
          setPaymentStatus("SUCCESSFUL");
          if (payType === "balance") {
            onDepositSuccess(settledProfile);
          } else if (data.subscription) {
            onGpuSuccess(data.subscription, selectedGpu?.amount || 0);
          }
          toast.success("Payment confirmed. Your account has been updated.");
        } else if (data.status === "FAILED") {
          setPaymentStatus("FAILED");
          toast.error("Payment failed. Please try again or contact support.");
          setErrorMsg("We couldn’t confirm this payment. Please try again or contact support.");
        } else {
          backoffRef.current = Math.min(backoffRef.current + 1, 2);
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      handledSuccessTransIdRef.current = null;
      console.error("Error polling payment status:", err);
      if (err instanceof Error && err.message.startsWith("Payment is confirmed")) {
        toast.error(err.message);
      }
    }
  };

  useGatedInterval(() => { void checkStatus(); }, getBackoff(), { enabled: paymentStatus === "PENDING" && !!currentTransId, visibilityGate: true });

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  const handleStartPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    const normalizedDepositPhone = normalizeUgandaPhone(mobileNumber);
    if (!/^\d{9,10}$/.test(normalizedDepositPhone)) {
      toast.error("Enter a valid mobile money number.");
      return;
    }
    const finalAmount = payType === "gpu" ? selectedGpu?.amount || 0 : depositAmount;
    const limitError = getDepositLimitError(finalAmount);
    if (limitError) {
      toast.error(limitError);
      return;
    }
    setIsSubmitting(true);
    setPaymentStatus("PENDING");
    setCurrentTransId(null);
    handledSuccessTransIdRef.current = null;
    const operator = "MTN";
    try {
      const response = await fetch("/api/payment/deposit", {
        method: "POST",
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
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Payment dispatch failed.");
      setCurrentTransId(data.trans_id);
      toast.info("Payment request sent. Check your phone and approve it to continue.");
    } catch (err: any) {
      console.error(err);
      setPaymentStatus("IDLE");
      toast.error(err.message || "We couldn’t start the mobile money payment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (depositMode === "usdt" && !config.usdtAddress?.trim()) {
      toast.error("USDT deposits are not available right now.");
      return;
    }
    let phoneTrim = normalizeUgandaPhone(senderPhone);
    if (depositMode === "manual") {
      if (!/^\d{9,10}$/.test(phoneTrim)) {
        toast.error("Enter a valid 9 or 10 digit sender number.");
        return;
      }
    } else {
      phoneTrim = "USDT_TRANSFER";
    }
    const refTrim = manualRef.trim();
    if (!refTrim) {
      toast.error("Enter the transaction ID or hash to submit your payment.");
      return;
    }
    const finalAmount =
      payType === "gpu"
        ? selectedGpu?.amount || 0
        : depositMode === "usdt"
        ? usdtAmountUSD * config.usdtRate
        : manualAmount;
    const limitError = getDepositLimitError(finalAmount);
    if (limitError) {
      toast.error(limitError);
      return;
    }
    setIsSubmitting(true);
    setPaymentStatus("PENDING");
    setCurrentTransId(null);
    let detectedOperator = depositMode === "usdt" ? "USDT" : "MTN";
    if (depositMode === "manual") {
      const normalizedPhone = phoneTrim;
      if (normalizedPhone.startsWith("070") || normalizedPhone.startsWith("075") || normalizedPhone.startsWith("074")) {
        detectedOperator = "Airtel";
      }
    }
    try {
      const response = await fetch("/api/manual/deposit", {
        method: "POST",
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
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Proof submission failed.");
      handledSuccessTransIdRef.current = null;
      setCurrentTransId(data.trans_id);
      toast.success("Payment details submitted. We’ll review them shortly.");
    } catch (err: any) {
      console.error(err);
      setPaymentStatus("IDLE");
      toast.error(err.message || "We couldn’t submit your payment details. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const finalAmount =
    depositMode === "usdt"
      ? payType === "gpu"
        ? selectedGpu?.amount || 0
        : usdtAmountUSD * config.usdtRate
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
    <div className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] text-[var(--theme-text)] space-y-4 select-none p-4 pt-0 min-h-[100dvh]">
      <div className="flex items-center justify-between rounded-2xl border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)]/70 px-4 py-3">
        <span className="text-[13px] font-semibold opacity-65">My capital</span>
        <strong className="font-display text-[17px] font-black tabular-nums">{formatCurrency(userProfile.rechargeableBalance || 0)}</strong>
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
                <div className="w-full h-full flex items-center justify-center text-[var(--theme-primary)] opacity-60">
                  <Cpu className="w-6 h-6" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-sans font-medium opacity-60 leading-none">Paying for</p>
              <p className="text-[15px] font-sans font-extrabold leading-tight truncate mt-1">{selectedGpu.name}</p>
              <p className="text-[11px] font-bold text-[var(--theme-primary)] leading-none mt-1">
                Earns {formatCurrency(selectedGpu.dailyYield)}/day • {selectedGpu.duration} days
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[12px] font-sans font-medium opacity-60">Price</p>
              <p className="text-sm font-black text-[var(--theme-primary)]">{formatCurrency(selectedGpu.amount)}</p>
            </div>
          </div>
        )}

      </div>

      {paymentStatus === "IDLE" ? (
        <div className="rounded-[var(--theme-radius)]">
          {/* Payment method dropdown */}
          <div className="p-3 space-y-3">
            <PaymentMethodSelect
              value={depositMode === "usdt" ? "crypto" : "mobile-money"}
              usdtNetwork={config.usdtNetwork || "TRC20"}
              mobileMoneyDisabled={!mobileMoneyEnabled}
              paymentImages={{ mtn: config.mtnLogoUrl, airtel: config.airtelLogoUrl, usdt: config.usdtLogoUrl }}
              onChange={(channel) => {
                setDepositMode(channel === "crypto" ? "usdt" : autoEnabled ? "auto" : "manual");
                setErrorMsg("");
              }}
            />
            {depositMode !== "usdt" && autoEnabled && manualEnabled ? (
              <div className="space-y-1.5">
                <label htmlFor="mobile-money-deposit-mode" className="text-xs font-semibold text-[var(--theme-text)] opacity-60">Mobile Money option</label>
                <div className="relative">
                  <select
                    id="mobile-money-deposit-mode"
                    value={depositMode}
                    onChange={(event) => { setDepositMode(event.target.value as "auto" | "manual"); setErrorMsg(""); }}
                    className="w-full appearance-none rounded-2xl border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] px-4 py-3 pr-11 text-sm font-semibold text-[var(--theme-text)] outline-none focus:border-[var(--theme-primary)] focus:ring-2 focus:ring-[var(--theme-primary)]/20"
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
          <div className="p-4 space-y-4">
            {depositMode === "auto" && (
              <form noValidate onSubmit={handleStartPayment} className="flex min-h-[50dvh] flex-col gap-5">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label htmlFor="deposit-mobile-number" className="text-[16px] font-sans font-medium opacity-60">Phone number</label>
                    <div className="relative">
                      <PhoneCall className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[var(--theme-primary)]" aria-hidden="true" />
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
                        className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 pl-10 pr-4 text-[15px] font-bold outline-none placeholder:font-medium placeholder:opacity-40 transition-colors"
                      />
                    </div>
                    <span id="deposit-mobile-number-format" className="sr-only">Enter a Ugandan mobile money number, including the country code +256.</span>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="deposit-amount" className="text-[16px] font-sans font-medium opacity-60">Amount (UGX)</label>
                    <div className="relative">
                      <Coins className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[var(--theme-primary)]" aria-hidden="true" />
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
                        value={payType === "gpu" ? selectedGpu?.amount || 0 : depositAmount}
                        onChange={(e) => setDepositAmount(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                        className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 pl-10 pr-4 text-[15px] font-black outline-none transition-colors disabled:opacity-60"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4">
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
              <form noValidate onSubmit={handleStartManualPayment} className="flex min-h-[50dvh] flex-col gap-5">
                {/* Receiver cards */}
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {config.mtnReceiverPhone ? (
                      <div className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] p-3 flex items-center justify-between gap-2">
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
                            toast.success("MTN number copied");
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
                      <div className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] p-3 flex items-center justify-between gap-2">
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
                            toast.success("Airtel number copied");
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
                      <span className="text-[var(--theme-primary)]">{formatCurrency(finalAmount)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(String(finalAmount));
                          toast.success("Amount copied");
                        }}
                        className="w-7 h-7 rounded-full bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] flex items-center justify-center cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="space-y-2">
                    <label htmlFor="manual-sender-number" className="text-[13px] font-sans font-medium opacity-60">Your sender number</label>
                    <div className="relative">
                      <PhoneCall className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[var(--theme-primary)]" aria-hidden="true" />
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
                        className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 pl-10 pr-4 text-[15px] font-bold outline-none placeholder:font-medium placeholder:opacity-40"
                      />
                    </div>
                    <span id="manual-sender-number-format" className="sr-only">Enter a mobile number in international format, for example +256 7XX XXX XXX.</span>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="manual-deposit-amount" className="text-[13px] font-sans font-medium opacity-60">Amount sent (UGX)</label>
                    <div className="relative">
                      <Coins className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[var(--theme-primary)]" aria-hidden="true" />
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
                        value={payType === "gpu" ? selectedGpu?.amount || 0 : manualAmount}
                        onChange={(e) => setManualAmount(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                        className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 pl-10 pr-4 text-[15px] font-black outline-none disabled:opacity-60"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="manual-deposit-reference" className="text-[13px] font-sans font-medium opacity-60">Transaction ID</label>
                    <input
                      id="manual-deposit-reference"
                      name="transactionId"
                      type="text"
                      required
                      autoComplete="off"
                      placeholder="Paste mobile money TxID"
                      value={manualRef}
                      onChange={(e) => setManualRef(e.target.value)}
                      className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 px-4 text-[15px] font-bold outline-none placeholder:font-medium placeholder:opacity-40"
                    />
                  </div>
                </div>

                <div className="mt-auto space-y-3 pt-6">
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
              <form noValidate onSubmit={handleStartManualPayment} className="flex min-h-[50dvh] flex-col gap-5">
                {/* Step 1 — QR + wallet */}
                <div className="space-y-3">
                  <p className="text-[15px] font-sans font-extrabold tracking-tight">Send USDT</p>
                    <div className="p-5 space-y-4">
                    {config.usdtQrUrl && (
                      <div className="flex justify-center">
                        <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-2xl overflow-hidden bg-white p-2.5 border border-[var(--theme-card-border)] shadow-sm">
                          <img src={config.usdtQrUrl} alt="USDT QR" className="w-full h-full object-contain" />
                        </div>
                      </div>
                    )}
                    <div className="text-center space-y-1">
                      <p className="text-xl font-display font-black text-[var(--theme-primary)] tracking-tight leading-none">{formatCurrency(finalAmount)}</p>
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
                            toast.success("Wallet copied");
                          }
                        }}
                        className="shrink-0 w-9 h-9 rounded-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] flex items-center justify-center hover:border-[var(--theme-primary)]/30 transition-colors cursor-pointer"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="space-y-2">
                    <label htmlFor="usdt-deposit-amount" className="text-[13px] font-sans font-medium opacity-60">Amount sent (USD)</label>
                    <div className="relative">
                      <Coins className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[var(--theme-primary)]" aria-hidden="true" />
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
                        value={payType === "gpu" ? ((selectedGpu?.amount || 0) / (config.usdtRate || 3700)).toFixed(2) : usdtAmountUSD}
                        onChange={(e) => setUsdtAmountUSD(Number(e.target.value) || 0)}
                        className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 pl-10 pr-4 text-[15px] font-black outline-none disabled:opacity-60"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="usdt-deposit-reference" className="text-[13px] font-sans font-medium opacity-60">Transaction Hash</label>
                    <input
                      id="usdt-deposit-reference"
                      name="transactionHash"
                      type="text"
                      required
                      autoComplete="off"
                      value={manualRef}
                      onChange={(e) => setManualRef(e.target.value)}
                      className="w-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-primary)_20%,transparent)] rounded-2xl py-4 px-4 text-[15px] font-bold outline-none placeholder:font-medium placeholder:opacity-40"
                    />
                  </div>
                </div>

                <div className="mt-auto space-y-3 pt-6">
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
      ) : paymentStatus === "PENDING" ? (
        <div className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-8 text-center space-y-4 shadow-sm">
          <div className="payment-status-spinner mx-auto rounded-full" aria-hidden="true" />
          <div className="space-y-1">
            <h3 className="font-black text-sm">
              {depositMode === "manual" || depositMode === "usdt" ? "Verification pending" : "Awaiting PIN confirmation"}
            </h3>
            <p className="text-xs font-bold opacity-60 leading-relaxed max-w-xs mx-auto">
              {depositMode === "manual" || depositMode === "usdt" ? (
                <>
                  Reference <span className="text-[var(--theme-primary)]">{currentTransId}</span> is under review. Your balance will update once the payment is confirmed.
                </>
              ) : (
                <>
                  Payment request sent to <span className="text-[var(--theme-primary)]">{mobileNumber}</span>. Approve <span className="text-[var(--theme-text)]">{formatCurrency(finalAmount)}</span> on your phone.
                </>
              )}
            </p>
          </div>
          {(depositMode === "manual" || depositMode === "usdt") && (
            <button
              type="button"
              onClick={() => {
                setPaymentStatus("IDLE");
                toast.info("Check History for updates.");
              }}
              className="px-4 py-2 rounded-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] text-xs font-black hover:border-[var(--theme-primary)]/30 transition-colors cursor-pointer"
            >
              Submit another proof
            </button>
          )}
        </div>
      ) : paymentStatus === "SUCCESSFUL" ? (
        <div className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-8 text-center space-y-5 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-500">
            <CheckCircle className="w-10 h-10" />
          </div>
          <div className="space-y-1">
            <h3 className="font-black text-sm uppercase tracking-wide">
              {payType === "gpu" ? "Product secured!" : "Account credited!"}
            </h3>
            <p className="text-xs font-bold opacity-60 max-w-sm mx-auto leading-relaxed">
              {payType === "gpu" ? (
                <><span className="text-[var(--theme-text)] opacity-100">{formatCurrency(finalAmount)}</span> payment confirmed. Your product is active.</>
              ) : (
                <><span className="text-[var(--theme-text)] opacity-100">{formatCurrency(finalAmount)}</span> has been credited to your account.</>
              )} {currentTransId ? `Reference: ${currentTransId}` : ""}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] p-4 max-w-xs mx-auto text-left space-y-2 text-xs font-bold">
            <div className="flex justify-between">
              <span className="opacity-60">Total</span>
              <span>{formatCurrency(finalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-60">Status</span>
              <span className="text-emerald-600">Approved</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-60">Type</span>
              <span className="text-[var(--theme-primary)] truncate ml-2">{payType === "gpu" && selectedGpu ? selectedGpu.name : "Deposit"}</span>
            </div>
          </div>
          <button
            onClick={() => {
              setPaymentStatus("IDLE");
              setErrorMsg("");
            }}
            className="w-full py-4 rounded-2xl bg-[var(--theme-primary)] text-[var(--theme-on-primary)] font-sans font-extrabold text-sm shadow-[0_3px_0_0_var(--theme-primary-shadow)] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
          >
            Make another deposit
          </button>
        </div>
      ) : (
        <div className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-8 text-center space-y-5 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-500">
            <XCircle className="w-10 h-10" />
          </div>
          <div className="space-y-1">
            <h3 className="font-black text-xs uppercase tracking-widest text-rose-500">Payment failed</h3>
            <p className="text-xs font-bold opacity-60 max-w-sm mx-auto">{errorMsg || "We couldn’t confirm this payment. Please try again."}</p>
          </div>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => {
                setPaymentStatus("IDLE");
                setErrorMsg("");
              }}
              className="px-5 py-2.5 rounded-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] text-xs font-black cursor-pointer"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
