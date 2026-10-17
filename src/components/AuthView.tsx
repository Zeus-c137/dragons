/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { UserProfile } from "../types";
import { Phone, Lock, Eye, EyeOff, User, ChevronLeft, ArrowRight, Gift, Link2, Mail, Send, CheckCircle2, UsersRound, MapPinned } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { BrandLogo } from "./BrandLogo";
import { fixGitHubImageUrl } from "../utils/imageUtils";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { formatUgandaPhoneInput, isValidUgandaPhone, normalizeUgandaPhone } from "../utils/ugandaPhone";

interface AuthViewProps {
  onAuthSuccess: (profile: UserProfile) => void;
  siteConfig?: any;
}

type AuthScreen = "welcome" | "login" | "register" | "support";

const FARM_HERO_IMAGE = "https://images.pexels.com/photos/34161995/pexels-photo-34161995/free-photo-of-free-range-chickens-grazing-on-a-farm.jpeg?auto=compress&cs=tinysrgb&w=1600";

// Welcome hero: admin-customizable via Custom Wallpapers (authBgImage).
// Blank until siteconfig loads — no flashing fallback image.

const PHONE_PATTERN = /^\d{9,10}$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,32}$/;

function CountUpMetric({ value }: { value: number | null }) {
  const reducedMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (value === null || !Number.isFinite(value)) return;
    if (reducedMotion) {
      setDisplayValue(value);
      return;
    }

    let startTime: number | null = null;
    let frame = 0;
    const duration = 900;
    const tick = (time: number) => {
      if (startTime === null) startTime = time;
      const progress = Math.min(1, (time - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion, value]);

  return <>{value === null ? "—" : Math.max(0, displayValue).toLocaleString("en-UG")}</>;
}

function AuthField({
  icon,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-text)] opacity-40 pointer-events-none">
        {icon}
      </span>
      <input
        {...props}
        className={`w-full pl-12 pr-12 py-4 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-2xl text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] text-[15px] font-sans font-medium outline-none transition-colors focus:border-[var(--theme-primary)] select-text ${className ?? ""}`}
      />
    </div>
  );
}

function PrimaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`w-full py-4 px-6 rounded-2xl bg-[var(--theme-primary)] text-[var(--theme-on-primary)] font-sans font-bold text-[15px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_0_0_var(--theme-primary-shadow)] active:shadow-none active:translate-y-[3px] ${className || ""}`}
    >
      {children}
    </button>
  );
}

export default function AuthView({ onAuthSuccess, siteConfig }: AuthViewProps) {
  const [screen, setScreen] = useState<AuthScreen>("welcome");
  const [failedWelcomeImages, setFailedWelcomeImages] = useState<string[]>([]);
  const [failedAuthBackground, setFailedAuthBackground] = useState(false);
  const [activeWelcomeSlide, setActiveWelcomeSlide] = useState(0);
  const reducedMotion = useReducedMotion();

  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Recovery is routed to the account's support conversation by username.
  const [recoveryUsername, setRecoveryUsername] = useState("");
  const [recoveryPhone, setRecoveryPhone] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryMsg, setRecoveryMsg] = useState("");
  const [recoverySending, setRecoverySending] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);

  const [localSiteConfig, setLocalSiteConfig] = useState<any>(null);
  const [peopleCount, setPeopleCount] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/system/stats", { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`System stats request failed (${response.status}).`);
        return response.json() as Promise<{ totalUsers?: unknown }>;
      })
      .then((stats) => {
        const count = 18000 + (stats.totalUsers ? Number(stats.totalUsers) : 0); // Add 9000 to the count to make it look more impressive
        if (Number.isFinite(count) && count >= 0) setPeopleCount(Math.floor(count));
      })
      .catch((error: unknown) => {
        if ((error as Error)?.name !== "AbortError") {
          console.warn("Could not load welcome metrics:", error);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    fetch("/api/config/site")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setLocalSiteConfig(data);
      })
      .catch(() => {});
  }, []);

  const activeConfig = localSiteConfig || siteConfig;
  const authBackgroundImage = fixGitHubImageUrl(String(activeConfig?.authBgImage || "").trim());
  const isAuthFormScreen = screen === "login" || screen === "register" || screen === "support";

  useEffect(() => {
    setFailedAuthBackground(false);
  }, [authBackgroundImage]);

  // Rotate through all configured welcome images, falling back to the farm hero.
  const rawSlideImages: string[] = Array.isArray((activeConfig as any)?.authSlideImages)
    ? (activeConfig as any).authSlideImages
    : [];
  const configuredWelcomeImages = Array.from(new Set(
    rawSlideImages
      .map((image) => fixGitHubImageUrl(String(image || "").trim()))
      .filter(Boolean)
  ));
  const configuredSlidesKey = configuredWelcomeImages.join("\n");
  const availableWelcomeImages = configuredWelcomeImages.filter((image) => !failedWelcomeImages.includes(image));
  const welcomeSlides = availableWelcomeImages.length > 0 ? availableWelcomeImages : [FARM_HERO_IMAGE];
  const welcomeSlidesKey = welcomeSlides.join("\n");
  const welcomeImage = welcomeSlides[activeWelcomeSlide % welcomeSlides.length];

  // Clear stale image failures when the configured carousel changes.
  useEffect(() => {
    setFailedWelcomeImages([]);
    setActiveWelcomeSlide(0);
  }, [configuredSlidesKey]);

  useEffect(() => {
    setActiveWelcomeSlide(0);
  }, [welcomeSlidesKey]);

  useEffect(() => {
    welcomeSlides.forEach((src) => {
      const preload = new Image();
      preload.decoding = "async";
      preload.src = src;
    });
  }, [welcomeSlidesKey]);

  useEffect(() => {
    if (screen !== "welcome" || welcomeSlides.length < 2) return;
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      setActiveWelcomeSlide((current) => (current + 1) % welcomeSlides.length);
    }, 6200);
    return () => window.clearInterval(interval);
  }, [screen, welcomeSlides.length, welcomeSlidesKey]);

  // Invite-link landing: ?ref=CODE (search or hash) jumps straight to
  // register with the code applied, then cleans the URL.
  useEffect(() => {
    let ref: string | null = null;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      ref = searchParams.get("ref");
      if (!ref) {
        const hashIndex = window.location.hash.indexOf("?");
        if (hashIndex !== -1) {
          const hashParams = new URLSearchParams(window.location.hash.substring(hashIndex));
          ref = hashParams.get("ref");
        }
      }
    } catch (e) {}

    if (ref) {
      setScreen("register");
      setInviteCode(ref.toUpperCase());
      setTimeout(() => {
        toast.success(`Referral code applied: ${ref!.toUpperCase()}`);
      }, 500);

      try {
        const url = new URL(window.location.href);
        let changed = false;
        if (url.searchParams.has("ref")) {
          url.searchParams.delete("ref");
          changed = true;
        }
        const hashQueryIndex = url.hash.indexOf("?");
        if (hashQueryIndex !== -1) {
          const hashPath = url.hash.slice(0, hashQueryIndex);
          const hashParams = new URLSearchParams(url.hash.slice(hashQueryIndex + 1));
          if (hashParams.has("ref")) {
            hashParams.delete("ref");
            url.hash = hashParams.toString() ? `${hashPath}?${hashParams.toString()}` : hashPath;
            changed = true;
          }
        }
        if (changed) window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
      } catch (error) {
        console.warn("Unable to clean referral URL:", error);
      }
    }
  }, []);

  const goTo = (next: AuthScreen) => {
    setPassword("");
    setShowPassword(false);
    setScreen(next);
  };

  const handleSubmit = async (e: React.FormEvent, mode: "login" | "register") => {
    e.preventDefault();

    if (!username.trim() || !password) {
      toast.error(mode === "register" ? "Please enter a username and password." : "Please enter your username or phone number and password.");
      return;
    }

    if (mode === "register" && !USERNAME_PATTERN.test(username.trim())) {
      toast.error("Username must be 3–32 characters and use letters, numbers, dots, underscores, or hyphens.");
      return;
    }

    if (mode === "register" && !isValidUgandaPhone(phone)) {
      toast.error("Enter a valid Ugandan phone number.");
      return;
    }

    if (password.length < 8 || password.length > 128) {
      toast.error("Password must be between 8 and 128 characters.");
      return;
    }

    setIsLoading(true);

    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const payload =
        mode === "register"
          ? { password, confirmPassword: password, inviteCode: inviteCode.trim().toUpperCase(), username: username.trim(), phone: normalizeUgandaPhone(phone) }
          : { username: username.trim(), password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed. Try again.");
      }

      if (mode === "register") {
        const issuedBonus = Number(data.profile?.points || 0);
        if (issuedBonus > 0) {
          // Carry the server-confirmed bonus through the register -> login
          // flow. The dashboard uses this one-shot handoff to distinguish a
          // genuinely new account from a normal returning login.
          sessionStorage.setItem(
            `pending_welcome_bonus_${data.profile?.id}`,
            JSON.stringify({ amount: issuedBonus, issuedAt: Date.now() })
          );
        }
        toast.success(
          Number(activeConfig?.registrationBonus ?? activeConfig?.welcomeBonus ?? 0) > 0
            ? "Registration successful! Log in to claim your registration bonus."
            : "Registration successful! You can now log in.",
          { duration: 6000 }
        );
        setTimeout(() => {
          goTo("login");
        }, 1200);
      } else {
        onAuthSuccess(data.profile);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Recovery requests are attached to the account's direct support thread.
  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const accountUsername = recoveryUsername.trim();
    const tel = recoveryPhone.trim();
    const mail = recoveryEmail.trim();
    const msg = recoveryMsg.trim();
    if (!USERNAME_PATTERN.test(accountUsername)) {
      toast.error("Enter the username on your account.");
      return;
    }
    if (tel && !PHONE_PATTERN.test(tel)) {
      toast.error("Contact phone number must be 9 or 10 digits.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      toast.error("Enter a valid email address.");
      return;
    }
    if (msg.length < 10) {
      toast.error("Describe the issue in a few words (min 10 characters).");
      return;
    }
    setRecoverySending(true);
    try {
      const res = await fetch("/api/auth/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: accountUsername,
          contactPhone: tel,
          email: mail,
          message: msg,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Could not reach support. Try again.");
      setRecoverySent(true);
      toast.success("Sent to support. They'll reach out. Typical response time is 15 mins.", { duration: 6000 });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not reach support. Try again.");
    } finally {
      setRecoverySending(false);
    }
  };
  const brandName = activeConfig?.brandName;
  const inviteBonus = Number(activeConfig?.inviteBonus ?? 0);
  const regBonus = Number(activeConfig?.registrationBonus ?? activeConfig?.welcomeBonus ?? 0);
  const authFormBrand = (
    <div className="auth-form-brand flex items-center gap-3">
      <BrandLogo siteConfig={activeConfig} className="flex h-[60px] w-[60px] shrink-0 items-center justify-center" />
      <span className="font-display text-md font-black tracking-tight">{brandName}</span>
    </div>
  );

  return (
    <div className="relative isolate min-h-[100dvh] overflow-x-hidden bg-[var(--theme-bg)] text-[var(--theme-text)] font-[var(--theme-font-family)] transition-colors">
      {(isAuthFormScreen || screen === "welcome") && authBackgroundImage && !failedAuthBackground && (
        <div className="auth-screen-backdrop" aria-hidden="true">
          <img
            src={authBackgroundImage}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailedAuthBackground(true)}
          />
        </div>
      )}
      {screen === "welcome" && authBackgroundImage && !failedAuthBackground && (
        <div className="auth-welcome-frost" aria-hidden="true" />
      )}
      {isAuthFormScreen && authFormBrand}
      {screen !== "welcome" && (
        <button
          type="button"
          aria-label="Back"
          onClick={() => goTo(screen === "support" ? "login" : "welcome")}
          className="auth-form-back-button flex h-10 w-10 items-center justify-center text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-primary)]/10"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      <div className={`relative z-10 w-full min-h-[100dvh] flex flex-col ${screen === "welcome" ? "mx-auto max-w-6xl px-3 pt-3 pb-6 sm:px-8 sm:pt-7" : isAuthFormScreen ? "m-0 p-0" : "mx-auto max-w-md px-6 pt-6 pb-8"}`}>
        {/* Brand header */}
        {!isAuthFormScreen && (
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <BrandLogo siteConfig={activeConfig} className="flex h-[60px] w-[60px] shrink-0 items-center justify-center sm:h-[45px] sm:w-[45px]" />
            <span className="min-w-0 truncate font-display text-sm font-black tracking-tight sm:text-base">{brandName}</span>
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {screen === "welcome" && (
              <>
                <button
                  type="button"
                  onClick={() => goTo("login")}
                  className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[var(--theme-primary)]/35 bg-[var(--theme-card-bg)]/45 px-2.5 text-[12px] font-sans font-bold text-[var(--theme-primary)] transition-colors hover:bg-[var(--theme-primary)]/8 sm:px-3 sm:text-[13px]"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => goTo("register")}
                  disabled={isLoading}
                  className="inline-flex min-h-9 items-center justify-center rounded-xl bg-[var(--theme-primary)] px-2.5 text-[12px] font-sans font-bold text-[var(--theme-on-primary)] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3 sm:text-[13px]"
                >
                  Register
                </button>
              </>
            )}
            </div>
          </div>
        )}

        {screen === "welcome" && (
          <div className="hidden sm:block h-px mt-5 bg-[var(--theme-card-border)]/80" />
        )}

        <AnimatePresence mode="wait">
          {/* ============ WELCOME ============ */}
          {screen === "welcome" && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="auth-welcome-grid flex-1 grid grid-cols-1 items-center gap-y-6 pt-5 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:gap-x-0 lg:gap-y-0 lg:pt-8"
            >
              <div className="auth-welcome-art order-1 relative h-[clamp(16rem,62vw,24rem)] min-h-[16rem] overflow-hidden bg-[#10264b] lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:h-auto lg:min-h-[23rem] lg:self-stretch">
                <AnimatePresence mode="sync">
                  <motion.img
                    key={welcomeImage}
                    src={welcomeImage}
                    alt="Free-range chickens roaming across a farmyard"
                    loading="eager"
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      if (welcomeImage !== FARM_HERO_IMAGE) {
                        setFailedWelcomeImages((failed) => failed.includes(welcomeImage) ? failed : [...failed, welcomeImage]);
                      } else {
                        event.currentTarget.style.display = "none";
                      }
                    }}
                    initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 1.08 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 1.08 }}
                    transition={{ duration: reducedMotion ? 0.2 : 0.85, ease: [0.16, 1, 0.3, 1] }}
                    className="auth-welcome-art-image auth-welcome-art-primary absolute block object-cover"
                  />
                </AnimatePresence>
                {welcomeSlides.length > 1 && (
                  <div className="absolute bottom-4 left-4 z-[4] flex items-center gap-1.5 rounded-full bg-[#08162d]/55 px-2.5 py-2 backdrop-blur-sm" aria-label="Welcome image slides">
                    {welcomeSlides.map((image, index) => (
                      <button
                        key={image}
                        type="button"
                        aria-label={`Show welcome image ${index + 1}`}
                        aria-current={index === activeWelcomeSlide ? "true" : undefined}
                        onClick={() => setActiveWelcomeSlide(index)}
                        className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ${index === activeWelcomeSlide ? "w-5 bg-white" : "w-1.5 bg-white/55 hover:bg-white/80"}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              <section className="auth-welcome-copy order-2 flex w-full flex-col justify-center pt-1 lg:col-start-2 lg:row-start-1 lg:pl-10 lg:pt-0 xl:pl-14">
                <h1 className="w-full font-display text-[clamp(2.5rem,5.2vw,4.5rem)] leading-[0.68] tracking-tight text-[var(--theme-text)]">
                  Hatch eggs.<br />Grow together.
                </h1>
                <div className="mt-5 max-w-[39rem] space-y-3 font-sans text-[15px] leading-[1.65] text-[var(--theme-text-muted)] sm:text-[16px]">
                  <p>We focus on responsible poultry farming, strong farmer partnerships, and high food safety standards to provide affordable, quality chicken for Ugandan families.</p>
                  <p>Additionally, the company operates over five breeding farms that produce over 2 million fertile
                    eggs per month and 2 hatcheries that hatch over 1 million day-old chicks per month</p>
                </div>
              </section>

              <section aria-label="Farm community and coverage" className="auth-welcome-metrics order-3 lg:col-start-2 lg:row-start-2 lg:pl-10 xl:pl-14">
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <article className="relative z-10 flex min-h-[8.75rem] flex-col justify-between rounded-[1.2rem] rounded-br-[0.4rem] border border-[var(--theme-on-primary)]/15 bg-[var(--theme-primary)] p-4 text-[var(--theme-on-primary)] shadow-[0_12px_28px_color-mix(in_srgb,var(--theme-primary)_22%,transparent)] lg:-translate-x-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-black uppercase tracking-[0.15em] opacity-75">People</p>
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--theme-on-primary)]/10">
                        <UsersRound className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </div>
                    <p className="font-display text-[clamp(2rem,3.2vw,2.75rem)] font-black leading-none tabular-nums">
                      <CountUpMetric value={peopleCount} />
                    </p>
                    <p className="text-[12px] font-semibold opacity-80">members on the farm</p>
                  </article>
                  <article className="flex min-h-[8.75rem] flex-col justify-between rounded-[1.2rem] rounded-tl-[0.4rem] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)]/95 p-4 text-[var(--theme-text)]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-black uppercase tracking-[0.15em] text-[var(--theme-text-muted)]">Coverage</p>
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--theme-primary)]/8 text-[var(--theme-primary)]">
                        <MapPinned className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </div>
                    <p className="font-display text-[clamp(2rem,3.2vw,2.75rem)] font-black leading-none tabular-nums text-[var(--theme-primary)]">
                      <CountUpMetric value={35} />
                    </p>
                    <p className="text-[12px] font-semibold text-[var(--theme-text-muted)]">35+ regions across Uganda</p>
                  </article>
                </div>
              </section>
            </motion.div>
          )}

          {/* ============ LOGIN ============ */}
          {screen === "login" && (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="auth-form-panel m-0 flex min-h-[100dvh] w-full flex-col"
            >
              <div className="auth-form-content">
                <h1 className="mt-10 text-center font-display font-black text-[clamp(2rem,5vw,2.6rem)] leading-[1.08] tracking-tight">
                  Welcome back.
                </h1>
                <p className="mt-3 text-center text-[15px] font-sans text-[var(--theme-text-muted)] leading-relaxed">
                  Sign in to continue your farm.
                </p>

                <form onSubmit={(e) => handleSubmit(e, "login")} className="mt-8 space-y-3.5">
                  <AuthField
                    icon={<User className="w-5 h-5" />}
                    type="text"
                    required
                    autoComplete="username"
                    maxLength={64}
                    aria-label="Username or phone number"
                    placeholder="Username or phone number"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                <div className="relative">
                  <AuthField
                    icon={<Lock className="w-5 h-5" />}
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    aria-label="Password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--theme-text)] opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => goTo("support")}
                    className="text-[13px] font-sans font-semibold text-[var(--theme-primary)] hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>

                <div className="pt-3">
                  <PrimaryButton type="submit" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Processing..
                      </>
                    ) : (
                      <>
                        Login <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </PrimaryButton>
                </div>
                </form>

                <div className="border-t border-[var(--theme-card-border)] mt-7 pt-5 text-center text-sm font-sans text-[var(--theme-text-muted)]">
                  New here?{" "}
                  <button
                    type="button"
                    onClick={() => goTo("register")}
                    className="font-bold text-[var(--theme-primary)] hover:underline cursor-pointer"
                  >
                    Register
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ============ REGISTER ============ */}
          {screen === "register" && (
            <motion.div
              key="register"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="auth-form-panel m-0 flex min-h-[100dvh] w-full flex-col"
            >
              <div className="auth-form-content">
                <h1 className="mt-10 font-display font-black text-[clamp(2rem,5vw,2.6rem)] leading-[1.08] tracking-tight">
                Start your farm.
                </h1>
                <p className="mt-3 text-[15px] font-sans text-[var(--theme-text-muted)] leading-relaxed">
                Choose a username, phone number, and password to get started.
                </p>

                {regBonus > 0 && (
                  <div className="relative mt-4 overflow-hidden rounded-2xl bg-[var(--theme-primary)]/10 px-3 py-2 tile-shimmer-5s">
                    <p className="flex items-center gap-1.5 text-xs font-sans text-white">
                      <Gift className="w-12 h-12 text-[var(--theme-primary)]" />
                      Plus UGX {regBonus.toLocaleString()} Registration bonus upon first login.
                    </p>
                  </div>
                )}

                <form onSubmit={(e) => handleSubmit(e, "register")} className="mt-5 space-y-3.5">
                <AuthField
                  icon={<User className="w-5 h-5" />}
                  type="text"
                  autoComplete="nickname"
                  maxLength={64}
                  aria-label="Username"
                  placeholder="Username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <AuthField
                  icon={<Phone className="w-5 h-5" />}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-label="Phone number"
                  placeholder="07"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={(e) => setPhone(formatUgandaPhoneInput(e.target.value))}
                />
                <div className="relative">
                  <AuthField
                    icon={<Lock className="w-5 h-5" />}
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    aria-label="Password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--theme-text)] opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <div>
                  <AuthField
                    icon={<Link2 className="w-5 h-5" />}
                    type="text"
                    autoComplete="off"
                    aria-label="Invite code"
                    placeholder="Invite code (Optional)"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                  />
                  {inviteBonus > 0 && (
                    <p className="mt-1.5 text-xs font-sans text-[var(--theme-primary)] font-semibold">
                      Invite bonus: UGX {inviteBonus.toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="pt-3">
                  <PrimaryButton type="submit" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Processing..
                      </>
                    ) : (
                      <>
                        Register <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </PrimaryButton>
                </div>
                </form>

                <div className="border-t border-[var(--theme-card-border)] mt-7 pt-5 text-center text-sm font-sans text-[var(--theme-text-muted)]">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => goTo("login")}
                    className="font-bold text-[var(--theme-primary)] hover:underline cursor-pointer"
                  >
                    Login
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ============ SUPPORT ============ */}
          {screen === "support" && (
            <motion.div
              key="support"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="auth-form-panel m-0 flex min-h-[100dvh] w-full flex-col"
            >
              <div className="auth-form-content auth-recovery-content">
                <h1 className="mt-10 text-center font-display font-black text-[clamp(2rem,5vw,2.6rem)] leading-[1.08] tracking-tight">
                  Recover your account.
                </h1>
                <p className="mt-3 text-center text-[15px] font-sans text-[var(--theme-text-muted)] leading-relaxed">
                  Tell our support team how to find you and we’ll help you get back in.
                </p>

                {recoverySent ? (
                  <div className="mt-8 border border-[var(--theme-primary)]/30 bg-[var(--theme-primary)]/10 px-5 py-6 text-center">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-[var(--theme-primary)]" />
                    <p className="mt-3 font-display font-black text-lg tracking-tight">Message sent.</p>
                    <p className="mt-2 text-[14px] font-sans text-[var(--theme-text-muted)] leading-relaxed">
                      If the username matches an account, support will reply using the contact details you provided.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setRecoverySent(false); setRecoveryMsg(""); }}
                      className="mt-4 text-[13px] font-sans font-semibold text-[var(--theme-primary)] hover:underline cursor-pointer"
                    >
                      Send another message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleRecoverySubmit} className="mt-8 space-y-3.5">
                    <AuthField
                      icon={<User className="w-5 h-5" />}
                      type="text"
                      required
                      autoComplete="username"
                      aria-label="Account username"
                      placeholder="Account username"
                      value={recoveryUsername}
                      onChange={(e) => setRecoveryUsername(e.target.value)}
                    />
                    <AuthField
                      icon={<Phone className="w-5 h-5" />}
                      type="tel"
                      autoComplete="tel"
                      aria-label="Contact phone number (optional)"
                      placeholder="Contact phone number (optional)"
                      value={recoveryPhone}
                      onChange={(e) => setRecoveryPhone(e.target.value)}
                    />
                    <AuthField
                      icon={<Mail className="w-5 h-5" />}
                      type="email"
                      required
                      autoComplete="email"
                      aria-label="Email address"
                      placeholder="Email address"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                    />
                    <textarea
                      required
                      aria-label="Describe the issue"
                      placeholder="Describe the issue"
                      value={recoveryMsg}
                      onChange={(e) => setRecoveryMsg(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      className="w-full px-4 py-4 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-2xl text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] text-[15px] font-sans font-medium outline-none transition-colors focus:border-[var(--theme-primary)] select-text resize-y"
                    />
                    <PrimaryButton type="submit" disabled={recoverySending}>
                      {recoverySending ? (
                        <>
                          <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          Send recovery request <Send className="w-4 h-4" />
                        </>
                      )}
                    </PrimaryButton>
                  </form>
                )}

              <div className="mt-8 border-t border-[var(--theme-card-border)] pt-5">
                <p className="mb-3 text-center text-[11px] font-sans font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
                  Other ways to reach us
                </p>
                <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px] font-sans font-semibold">
                <a
                  href={activeConfig?.whatsappLink || "https://t.me/#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--theme-primary)] hover:underline"
                >
                  WhatsApp support
                </a>

                <a
                  href={activeConfig?.telegramLink || "https://t.me/#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--theme-primary)] hover:underline"
                >
                  Telegram support
                </a>
              </div>
              </div>

              <div className="border-t border-[var(--theme-card-border)] mt-6 pt-5 text-center text-sm font-sans text-[var(--theme-text-muted)]">
                Remembered it?{" "}
                <button
                  type="button"
                  onClick={() => goTo("login")}
                  className="font-bold text-[var(--theme-primary)] hover:underline cursor-pointer"
                >
                  Login
                </button>
              </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
