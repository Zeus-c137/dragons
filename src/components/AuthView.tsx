/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { UserProfile } from "../types";
import { Phone, Lock, Eye, EyeOff, User, ChevronLeft, ArrowRight, Gift, Link2, Mail, Send, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { BrandLogo } from "./BrandLogo";
import { fixGitHubImageUrl } from "../utils/imageUtils";

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
  const [failedWelcomeImage, setFailedWelcomeImage] = useState(false);
  const [failedAuthBackground, setFailedAuthBackground] = useState(false);

  const [username, setUsername] = useState("");
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

  // Use the first configured welcome image when available; otherwise show the farm hero.
  const rawSlideImages: string[] = Array.isArray((activeConfig as any)?.authSlideImages)
    ? (activeConfig as any).authSlideImages
    : [];
  const welcomeImage = fixGitHubImageUrl(String(rawSlideImages[0] || "").trim());

  // Reset a previous image-load failure when the admin changes the image.
  useEffect(() => {
    setFailedWelcomeImage(false);
  }, [welcomeImage]);

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
      toast.error("Please enter both username and password.");
      return;
    }

    if (mode === "register" && !USERNAME_PATTERN.test(username.trim())) {
      toast.error("Username must be 3–32 characters and use letters, numbers, dots, underscores, or hyphens.");
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
          ? { password, confirmPassword: password, inviteCode: inviteCode.trim().toUpperCase(), username: username.trim() }
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
  const brandName = activeConfig?.brandName || "Cash Dragons";
  const inviteBonus = Number(activeConfig?.inviteBonus ?? 0);
  const regBonus = Number(activeConfig?.registrationBonus ?? activeConfig?.welcomeBonus ?? 0);
  const authFormBrand = (
    <div className="auth-form-brand flex items-center gap-3">
      <BrandLogo siteConfig={activeConfig} className="flex h-9 w-9 shrink-0 items-center justify-center" />
      <span className="font-display text-lg font-black tracking-tight">{brandName}</span>
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
      <div className={`relative z-10 w-full min-h-[100dvh] flex flex-col ${screen === "welcome" ? "mx-auto max-w-6xl px-5 pt-5 pb-6 sm:px-8 sm:pt-7" : isAuthFormScreen ? "m-0 p-0" : "mx-auto max-w-md px-6 pt-6 pb-8"}`}>
        {/* Brand header */}
        {!isAuthFormScreen && (
          <div className="flex items-center gap-3">
            <BrandLogo siteConfig={activeConfig} className="w-9 h-9 flex items-center justify-center shrink-0" />
            <span className="font-display font-black text-lg tracking-tight">{brandName}</span>
            <div className="flex-1" />
            {screen === "welcome" && (
              <button
                type="button"
                onClick={() => goTo("login")}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-sans font-bold text-[var(--theme-primary)] transition-colors hover:bg-[var(--theme-primary)]/8"
              >
                Log in <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
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
              className="auth-welcome-grid flex-1 grid grid-cols-1 lg:grid-cols-[0.92fr_1.08fr] items-center gap-x-8 gap-y-7 pt-5 lg:pt-8"
            >
              <h1 className="order-1 w-full font-display text-[clamp(3rem,6.5vw,5.5rem)] leading-[0.98] tracking-tight text-[var(--theme-text)] lg:col-span-2">
                Your farm awaits..
              </h1>

              <section className="auth-welcome-copy order-3 lg:order-2 flex w-full flex-col justify-center">
                <p className="w-full text-[16px] font-sans text-[var(--theme-text-muted)] leading-[1.65]">
                 Hatch eggs, raise chickens.<br />
                 Collect income
                </p>

                <div className="mt-8">
                  <PrimaryButton
                    onClick={() => goTo("register")}
                    disabled={isLoading}
                    className="max-w-sm justify-between rounded-xl px-5 py-4 text-left text-[15px]"
                  >
                    <span>Create your account</span>
                    <ArrowRight className="h-4 w-4" />
                  </PrimaryButton>
                </div>
              </section>

              <div className="auth-welcome-art order-2 lg:order-3 relative min-h-[350px] sm:min-h-[340px] lg:min-h-[min(68vh,680px)] overflow-hidden bg-[#10264b]">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={welcomeImage && !failedWelcomeImage ? "custom-welcome" : "farm-hero"}
                    src={welcomeImage && !failedWelcomeImage ? welcomeImage : FARM_HERO_IMAGE}
                    alt="Free-range chickens roaming across a farmyard"
                    loading="eager"
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      if (welcomeImage && !failedWelcomeImage) setFailedWelcomeImage(true);
                      else event.currentTarget.style.display = "none";
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="auth-welcome-art-image auth-welcome-art-primary absolute block object-cover"
                  />
                </AnimatePresence>
               
              </div>
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
                  Sign in to continue your collection.
                </p>

                <form onSubmit={(e) => handleSubmit(e, "login")} className="mt-8 space-y-3.5">
                  <AuthField
                    icon={<User className="w-5 h-5" />}
                    type="text"
                    required
                    autoComplete="username"
                    maxLength={64}
                    aria-label="Username"
                    placeholder="Username"
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
                Start your collection.
                </h1>
                <p className="mt-3 text-[15px] font-sans text-[var(--theme-text-muted)] leading-relaxed">
                Choose a username. Add payment details when you need them.
                </p>

                <form onSubmit={(e) => handleSubmit(e, "register")} className="mt-8 space-y-3.5">
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

                {regBonus > 0 && (
                  <div className="relative overflow-hidden rounded-2xl bg-[var(--theme-primary)]/10 px-3 py-2 tile-shimmer-5s">
                    <p className="flex items-center gap-1.5 text-xs font-sans text-[var(--theme-text-muted)]">
                      <Gift className="w-12 h-12 text-[var(--theme-primary)]" />
                      Plus UGX {regBonus.toLocaleString()} Registration bonus upon first login.
                    </p>
                  </div>
                )}

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
