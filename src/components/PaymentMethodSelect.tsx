import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Coins, Smartphone } from "lucide-react";

export type PaymentChannel = "mobile-money" | "crypto";

interface PaymentMethodSelectProps {
  value: PaymentChannel;
  usdtNetwork?: string;
  label?: string;
  mobileMoneyDisabled?: boolean;
  paymentImages?: {
    mtn?: string;
    airtel?: string;
    usdt?: string;
  };
  onChange: (value: PaymentChannel) => void;
}

export default function PaymentMethodSelect({
  value,
  usdtNetwork,
  label = "",
  mobileMoneyDisabled = false,
  paymentImages,
  onChange,
}: PaymentMethodSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isCrypto = value === "crypto";
  const title = isCrypto ? "Crypto" : "Mobile Money";
  const description = isCrypto
    ? `Send USDT${usdtNetwork ? ` on ${usdtNetwork}` : " to your wallet"}.`
    : "MTN MOMO or Airtel Money";

  useEffect(() => {
    if (!open) return;
    const closeIfOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const renderMethodArt = (channel: PaymentChannel, compact = false) => {
    const size = compact ? "h-8 w-8" : "h-10 w-10";
    if (channel === "crypto") {
      return paymentImages?.usdt ? (
        <img src={paymentImages.usdt} alt="USDT" referrerPolicy="no-referrer" className={`${size} rounded-full border border-[var(--theme-card-border)] bg-white object-contain p-1`} />
      ) : (
        <span className={`${size} grid place-items-center rounded-full bg-emerald-500/10 text-emerald-600`}><Coins className="h-4 w-4" aria-hidden="true" /></span>
      );
    }

    const logos = [
      paymentImages?.mtn ? { src: paymentImages.mtn, name: "MTN" } : null,
      paymentImages?.airtel ? { src: paymentImages.airtel, name: "Airtel" } : null,
    ].filter((logo): logo is { src: string; name: string } => Boolean(logo));
    if (!logos.length) {
      return <span className={`${size} grid place-items-center rounded-full bg-[var(--theme-primary)]/10 text-[var(--theme-accent)]`}><Smartphone className="h-4 w-4" aria-hidden="true" /></span>;
    }
    return (
      <span className="flex shrink-0 items-center -space-x-2">
        {logos.map((logo) => (
          <img key={logo.name} src={logo.src} alt={logo.name} referrerPolicy="no-referrer" className={`${size} rounded-full border-2 border-[var(--theme-card-bg)] bg-white object-contain p-1`} />
        ))}
      </span>
    );
  };

  const choose = (channel: PaymentChannel) => {
    if (channel === "mobile-money" && mobileMoneyDisabled) return;
    onChange(channel);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="">
      <label className="block text-[11px] font-sans font-black uppercase tracking-[0.12em] text-[var(--theme-text)] opacity-55">
        {label}
      </label>
      <div ref={rootRef} className={`relative ${open ? "z-30" : ""}`}>
        <button
          ref={triggerRef}
          type="button"
          aria-label={`${label}: ${title}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls="payment-method-options"
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen(true);
            }
          }}
        className="flex min-h-[56px] w-full items-center gap-2.5 rounded-2xl border border-white/20 bg-[var(--theme-card-bg)]/70 px-3 py-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] backdrop-blur-xl transition-colors hover:border-[var(--theme-primary)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg)]"
        >
          {renderMethodArt(value, true)}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-black text-[var(--theme-text)]">{title}</span>
            <span className="mt-0.5 block truncate text-xs font-medium text-[var(--theme-text)] opacity-60">{description}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--theme-text)] opacity-55 transition-transform duration-150 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {open ? (
          <div
            id="payment-method-options"
            role="listbox"
            aria-label={label}
            className="absolute left-0 right-0 top-full z-50 mt-2 grid max-h-[min(46dvh,22rem)] w-full gap-2 overflow-y-auto overscroll-contain rounded-2xl border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] p-2 shadow-xl"
          >
            {([
              { channel: "mobile-money", title: "Mobile Money", subtitle: "Pay using MTN or Airtel Money." },
              { channel: "crypto", title: "Crypto (USDT)", subtitle: `Use ${usdtNetwork || "TRC20"} network.` },
            ] as const).map((option) => {
              const selected = option.channel === value;
              const disabled = option.channel === "mobile-money" && mobileMoneyDisabled;
              return (
                <button
                  key={option.channel}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={disabled}
                  onClick={() => choose(option.channel)}
                  className={`flex min-h-[52px] w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${selected ? "border-[var(--theme-primary)]/40 bg-[var(--theme-primary)]/8" : "border-transparent hover:bg-[var(--theme-bg)]"} disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  {renderMethodArt(option.channel, true)}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[var(--theme-text)]">{option.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--theme-text)] opacity-55">{option.subtitle}</span>
                  </span>
                  {selected ? <Check className="h-4 w-4 shrink-0 text-[var(--theme-accent)]" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
