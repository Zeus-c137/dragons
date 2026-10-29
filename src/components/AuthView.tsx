/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { UserProfile } from "../types";
import { Phone, Lock, Eye, EyeOff, User, ChevronLeft, Gift, Link2, Mail, Send, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { notify } from "../lib/notify";
import { BrandLogo } from "./BrandLogo";
import { fixGitHubImageUrl } from "../utils/imageUtils";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { formatUgandaPhoneInput, isValidUgandaPhone, normalizeUgandaPhone } from "../utils/ugandaPhone";

interface AuthViewProps {
  onAuthSuccess: (profile: UserProfile) => void;
  siteConfig?: any;
}

type AuthScreen = "welcome" | "login" | "register" | "support";

// Welcome bg + carousel: admin-customizable via Custom Wallpapers
// (authBgImage is the everything-sits-on-it base; authSlideImages rotate
// full-screen above it. No baked-in fallbacks).

const PHONE_PATTERN = /^\d{9,10}$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,32}$/;

/**
 * Display-only social proof under the Log in button. Kept in its own component
 * so the per-frame count-up does not re-render the whole welcome screen.
 */
function AnimatedFarmerCount({
  floor,
  ceiling,
  reducedMotion,
}: {
  floor: number;
  ceiling: number;
  reducedMotion: boolean;
}) {
  const [count, setCount] = useState(() =>
    Math.min(ceiling, Math.max(floor, Math.round(floor + (ceiling - floor) * 0.55)))
  );
  const formattedCount = count.toLocaleString("en-UG");

  useEffect(() => {
    const range = ceiling - floor;
    let cancelled = false;
    let timeoutId = 0;
    let frameId = 0;
    let current = Math.min(ceiling, Math.max(floor, Math.round(floor + range * (0.25 + Math.random() * 0.6))));
    setCount(current);
    if (range <= 0) return;

    const maxStep = Math.max(4, Math.round(range * 0.1114));
    const animateTo = (next: number) => {
      if (reducedMotion) {
        current = next;
        setCount(next);
        return;
      }
      // A throttled/occluded tab can queue several tweens; keep only the newest.
      window.cancelAnimationFrame(frameId);
      const start = current;
      const startedAt = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const progress = Math.min(3, (now - startedAt) / 3000);
        const eased = 2 - Math.pow(2 - progress, 3);
        current = Math.round(start + (next - start) * eased);
        setCount(current);
        if (progress < 1) frameId = window.requestAnimationFrame(tick);
      };
      frameId = window.requestAnimationFrame(tick);
    };

    const schedule = () => {
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        // Mean-reverting walk: drift toward the middle, then add a random step.
        const midpoint = floor + range * 0.85;
        const pull = (midpoint - current) * 0.28;
        const jitter = (Math.random() * 2 - 1) * maxStep;
        let next = Math.round(current + pull + jitter);
        if (next === current) next += Math.random() < 0.5 ? -1 : 2;
        next = Math.max(floor, Math.min(ceiling, next));
        animateTo(next);
        schedule();
      }, 2400 + Math.random() * 2200);
    };
    schedule();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(frameId);
    };
  }, [ceiling, floor, reducedMotion]);

  return (
    <>
      <span className="sr-only">{formattedCount}</span>
      <span aria-hidden="true" className="inline-flex items-baseline tabular-nums">
        {Array.from(formattedCount, (character, index) => (
          <span
            key={index}
            className={`relative inline-grid h-[1.15em] overflow-hidden align-bottom ${character === "," ? "min-w-[0.2em]" : "min-w-[0.62em] text-center"}`}
            style={{ perspective: "7rem" }}
          >
            <AnimatePresence initial={false} mode="sync">
              <motion.span
                key={character}
                initial={reducedMotion ? false : { opacity: 0, y: "-75%", rotateX: -65 }}
                animate={{ opacity: 1, y: "0%", rotateX: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: "75%", rotateX: 65 }}
                transition={reducedMotion
                  ? { duration: 0 }
                  : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="col-start-1 row-start-1 inline-block"
              >
                {character}
              </motion.span>
            </AnimatePresence>
          </span>
        ))}
      </span>
    </>
  );
}

const LANDING_DESCRIPTION =
  "This virtual simulation focuses on responsible poultry farming, hatching eggs, caring for chicks till they are ready for market. Hatch with friends through your invite code and cash out.";
const SPLIT_DESCRIPTION_PHRASES = [
  "hatching eggs",
  "caring for chicks",
  "Hatch with friends",
  "cash out",
];

function LandingDescription({ reducedMotion }: { reducedMotion: boolean }) {
  if (reducedMotion) return <>{LANDING_DESCRIPTION}</>;

  const fragments: React.ReactNode[] = [];
  let remainder = LANDING_DESCRIPTION;
  let key = 0;

  while (remainder.length > 0) {
    const nextPhrase = SPLIT_DESCRIPTION_PHRASES
      .map((phrase) => ({ phrase, index: remainder.indexOf(phrase) }))
      .filter(({ index }) => index >= 0)
      .sort((left, right) => left.index - right.index)[0];

    if (!nextPhrase) {
      fragments.push(<React.Fragment key={key++}>{remainder}</React.Fragment>);
      break;
    }

    if (nextPhrase.index > 0) {
      fragments.push(<React.Fragment key={key++}>{remainder.slice(0, nextPhrase.index)}</React.Fragment>);
    }

    const phrase = nextPhrase.phrase;
    fragments.push(
      <motion.span
        key={key++}
        aria-hidden="true"
        className="whitespace-nowrap font-extrabold text-white"
      >
        {Array.from(phrase, (character, index) => (
          <motion.span
            key={`${index}-${character}`}
            initial={{ opacity: 0, y: 7, rotateX: -35 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{
              duration: 0.32,
              delay: 0.16 + (key * 0.025) + (index * 0.014),
              ease: [0.22, 1, 0.36, 1],
            }}
            className="inline-block"
          >
            {character === " " ? "\u00a0" : character}
          </motion.span>
        ))}
      </motion.span>
    );
    remainder = remainder.slice(nextPhrase.index + phrase.length);
  }

  return (
    <>
      <span className="sr-only">{LANDING_DESCRIPTION}</span>
      <span aria-hidden="true">{fragments}</span>
    </>
  );
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
        className={`w-full pl-11 pr-11 py-3 bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-xl text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] text-[15px] font-sans font-medium outline-none transition-colors focus:border-[var(--theme-primary)] select-text ${className ?? ""}`}
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
      className={`user-glossy-button w-full py-4 px-6 rounded-2xl text-[var(--theme-on-primary)] font-sans font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${className || ""}`}
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
  const [totalUsers, setTotalUsers] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/system/stats", { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`System stats request failed (${response.status}).`);
        return response.json() as Promise<{ totalUsers?: unknown }>;
      })
      .then((stats) => {
        const count = Number(stats.totalUsers);
        setTotalUsers(Number.isFinite(count) && count > 0 ? Math.floor(count) : 0);
      })
      .catch((error: unknown) => {
        if ((error as Error)?.name !== "AbortError") {
          console.warn("Could not load welcome metrics:", error);
          // Keep the display ticker alive on the manual baseline when stats fail.
          setTotalUsers(0);
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

  // Prefer the freshest copy so an admin save updates the landing ticker without a reload.
  const activeConfig =
    siteConfig && Number(siteConfig.updatedAt || 0) > Number(localSiteConfig?.updatedAt || 0)
      ? siteConfig
      : localSiteConfig || siteConfig;
  const authBackgroundImage = fixGitHubImageUrl(String(activeConfig?.authBgImage || "").trim());
  const isAuthFormScreen = screen === "login" || screen === "register" || screen === "support";

  // Landing ticker: a manual baseline plus real registered users, capped by an
  // admin-set ceiling. The number random-walks between those bounds so the farm
  // reads as busy without ever running away.
  const configuredBase = Number(activeConfig?.activeFarmersBase);
  const configuredCeiling = Number(activeConfig?.activeFarmersCeiling);
  const activeFarmersBase = Number.isFinite(configuredBase) && configuredBase > 0 ? Math.floor(configuredBase) : 300;
  const activeFarmersFloor = activeFarmersBase + (totalUsers ?? 0);
  const activeFarmersCeiling = Math.max(
    activeFarmersFloor,
    Number.isFinite(configuredCeiling) && configuredCeiling > 0
      ? Math.floor(configuredCeiling)
      : activeFarmersFloor + 447
  );

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
  const welcomeSlides = availableWelcomeImages;
  const welcomeSlidesKey = welcomeSlides.join("\n");
  const welcomeImage = welcomeSlides.length > 0 ? welcomeSlides[activeWelcomeSlide % welcomeSlides.length] : "";

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
        notify("success", `Referral code applied: ${ref!.toUpperCase()}`);
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
      notify("error", mode === "register" ? "Please enter a username and password." : "Please enter your username or phone number and password.");
      return;
    }

    if (mode === "register" && !USERNAME_PATTERN.test(username.trim())) {
      notify("error", "Username must be 3–32 characters and use letters, numbers, dots, underscores, or hyphens.");
      return;
    }

    if (mode === "register" && !isValidUgandaPhone(phone)) {
      notify("error", "Enter a valid Ugandan phone number.");
      return;
    }

    if (password.length < 8 || password.length > 128) {
      notify("error", "Password must be between 8 and 128 characters.");
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
        notify("success", Number(activeConfig?.registrationBonus ?? activeConfig?.welcomeBonus ?? 0) > 0
            ? "Registration successful! Log in to claim your registration bonus."
            : "Registration successful! You can now log in.", { duration: 6000 });
        setTimeout(() => {
          goTo("login");
        }, 1200);
      } else {
        onAuthSuccess(data.profile);
      }
    } catch (err: any) {
      notify("error", err.message);
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
      notify("error", "Enter the username on your account.");
      return;
    }
    if (tel && !PHONE_PATTERN.test(tel)) {
      notify("error", "Contact phone number must be 9 or 10 digits.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      notify("error", "Enter a valid email address.");
      return;
    }
    if (msg.length < 10) {
      notify("error", "Describe the issue in a few words (min 10 characters).");
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
      notify("success", "Sent to support. They'll reach out. Typical response time is 15 mins.", { duration: 6000 });
    } catch (err: unknown) {
      notify("error", err instanceof Error ? err.message : "Could not reach support. Try again.");
    } finally {
      setRecoverySending(false);
    }
  };
  const brandName = activeConfig?.brandName;
  // Two-tone wordmark: the first half reads in ink, the second half in gold (kash|chick).
  const brandBaseMark = String(brandName ?? "").slice(0, Math.floor(String(brandName ?? "").length / 2));
  const brandGoldMark = String(brandName ?? "").slice(Math.floor(String(brandName ?? "").length / 2));
  const inviteBonus = Number(activeConfig?.inviteBonus ?? 0);
  const regBonus = Number(activeConfig?.registrationBonus ?? activeConfig?.welcomeBonus ?? 0);
  // Critically damped springs (Apple §4): graceful settle, no overshoot on entrance.
  const heroSpring = (delay: number) => ({
    initial: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14 },
    animate: reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 },
    transition: reducedMotion
      ? { duration: 0.3, delay }
      : { type: "spring" as const, bounce: 0, duration: 0.5, delay },
  });
  const authFormBrand = (
    <div className="auth-form-brand flex items-center gap-3">
      <BrandLogo siteConfig={activeConfig} className="flex h-[60px] w-[60px] shrink-0 items-center justify-center" />
      <span className="font-display text-md font-black tracking-tight">{brandBaseMark}<span className="text-[var(--theme-primary)]">{brandGoldMark}</span></span>
    </div>
  );

  return (
    <div className="relative isolate min-h-[100dvh] overflow-x-hidden bg-[var(--theme-bg)] text-[var(--theme-text)] font-[var(--theme-font-family)] transition-colors">
      {/* Admin-set auth background — the landing page's everything-sits-on-it layer.
          Welcome shows it bare (no scrim); login/register keep their dimmed treatment. */}
      {(screen === "welcome" || (isAuthFormScreen && authBackgroundImage && !failedAuthBackground)) && (
        <div className={`auth-screen-backdrop ${screen === "welcome" ? "auth-screen-backdrop--clear" : ""}`} aria-hidden="true">
          {authBackgroundImage && !failedAuthBackground && (
            <img
              src={authBackgroundImage}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setFailedAuthBackground(true)}
            />
          )}
        </div>
      )}
      {/* Full-screen rotating carousel sits above the static bg, below the content */}
      {screen === "welcome" && welcomeSlides.length > 0 && (
        <div className="fixed inset-0 z-[1] overflow-hidden" aria-hidden="true">
          <AnimatePresence mode="sync" initial={false}>
            <motion.img
              key={welcomeImage}
              src={welcomeImage}
              alt=""
              loading="eager"
              referrerPolicy="no-referrer"
              onError={() => {
                setFailedWelcomeImages((failed) => failed.includes(welcomeImage) ? failed : [...failed, welcomeImage]);
              }}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 1.05 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0 }}
              transition={{ duration: reducedMotion ? 0.25 : 1.05, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 block h-full w-full object-cover"
            />
          </AnimatePresence>
        </div>
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
      <div className={`relative z-10 w-full min-h-[100dvh] flex flex-col ${screen === "welcome" ? "p-0" : isAuthFormScreen ? "m-0 p-0" : "mx-auto max-w-md px-6 pt-6 pb-8"}`}>
        <AnimatePresence mode="wait">
          {/* ============ WELCOME ============ */}
          {screen === "welcome" && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={reducedMotion ? { duration: 0.3 } : { type: "spring" as const, bounce: 0, duration: 0.45 }}
              className="auth-welcome-grid relative flex-1 flex flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] pt-[calc(env(safe-area-inset-top)+6.5rem)] sm:px-8 lg:px-16 xl:px-24"
            >
              {/* Edge scrims — gradient veils keep nav, badges and dots readable over any image (Apple §12, scroll-edge effect) */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[linear-gradient(180deg,rgba(7,20,43,0.66),rgba(7,20,43,0))] sm:h-44" />
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-[linear-gradient(0deg,rgba(7,20,43,0.55),rgba(7,20,43,0))]" />

              {/* Transparent top nav overlay — no background, no border */}
              <div className="absolute inset-x-0 top-0 z-30 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8 sm:pt-[max(1.1rem,env(safe-area-inset-top))] lg:px-16 xl:px-24">
                <div className="flex items-center gap-2 sm:gap-3">
                  <BrandLogo siteConfig={activeConfig} className="flex h-[45px] w-[45px] shrink-0 items-center justify-center" />
                  <span className="min-w-0 truncate font-display text-sm font-black tracking-tight sm:text-base">
                    <span className="text-white drop-shadow-[0_1px_8px_rgba(7,20,43,0.6)]">{brandBaseMark}</span>
                    <span className="text-[var(--theme-primary)] drop-shadow-[0_1px_8px_rgba(7,20,43,0.6)]">{brandGoldMark}</span>
                  </span>
                  <div className="ml-auto flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => goTo("login")}
                      className="user-glossy-button user-glossy-button--small inline-flex min-h-9 items-center justify-center rounded-xl px-2.5 text-[12px] font-sans font-bold text-[var(--theme-on-primary)] sm:px-3 sm:text-[13px]"
                    >
                      Login
                    </button>
                  </div>
                </div>
                {/* Display-only active count hangs beneath the Log in button */}
                <motion.p {...heroSpring(0.1)} className="mt-1.5 flex h-6 items-center justify-end gap-2.5">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--theme-primary)] shadow-[0_0_0_3.5px_color-mix(in_srgb,var(--theme-primary)_22%,transparent)]" aria-hidden="true" />
                  <span className="text-[13px] font-sans font-bold tabular-nums text-white [text-shadow:0_1px_10px_rgba(7,20,43,0.55)] sm:text-[14px]">
                    {totalUsers === null ? "—" : (
                      <AnimatedFarmerCount
                        floor={activeFarmersFloor}
                        ceiling={activeFarmersCeiling}
                        reducedMotion={reducedMotion}
                      />
                    )}
                    <span className="ml-1.5 font-semibold text-white/75">online</span>
                  </span>
                </motion.p>
              </div>

              {/* Copy block — my-auto centers it when there's room, top-aligns without clipping on short viewports */}
              <div className="relative mx-auto my-auto w-full max-w-[36rem] text-center">
                <div aria-hidden="true" className="auth-hero-veil">
                  <span className="auth-hero-veil-blur" />
                  <span className="auth-hero-veil-tint" />
                </div>
                <div className="relative">
                  <motion.h1 {...heroSpring(0.05)} className="font-display text-[clamp(2.6rem,7vw,4.9rem)] font-black leading-[0.98] tracking-tight [text-shadow:0_2px_18px_rgba(7,20,43,0.35)]">
                    <span className="text-white">Your living</span>
                    <br />
                    <span className="text-[var(--theme-primary)]">farm</span>
                  </motion.h1>
                  <motion.p {...heroSpring(0.13)} className="mx-auto mt-4 max-w-[27rem] font-sans text-[15px] font-semibold leading-[1.65] text-white/90 [text-shadow:0_1px_12px_rgba(7,20,43,0.45)] sm:mt-5 sm:text-[16px]">
                    <LandingDescription reducedMotion={reducedMotion} />
                  </motion.p>
                  <motion.button
                    {...heroSpring(0.21)}
                    type="button"
                    onClick={() => goTo("register")}
                    disabled={isLoading}
                    className="user-glossy-button mx-auto mt-7 flex h-12 w-fit items-center justify-center gap-2.5 rounded-xl px-9 font-sans text-[15px] font-black text-[var(--theme-on-primary)] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:mt-8"
                  >
                    Create account
                  </motion.button>
                </div>
              </div>

              {welcomeSlides.length > 1 && (
                <div className="absolute inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+2.5rem)] z-[4] flex items-center justify-center gap-1.5 rounded-full bg-[#08162d]/55 py-2 pl-3 pr-3.5 backdrop-blur-sm" aria-label="Welcome image slides">
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

              {/* Pinned legal footnote at the very bottom of the welcome screen */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={reducedMotion ? { duration: 0.3 } : { type: "spring" as const, bounce: 0, duration: 0.5, delay: 0.34 }}
                className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.8rem)] z-[4] text-center font-sans text-[10.5px] font-semibold text-white/55 [text-shadow:0_1px_8px_rgba(7,20,43,0.6)]"
              >
                Terms and conditions apply.
              </motion.p>

            </motion.div>
          )}

          {/* ============ LOGIN ============ */}
          {screen === "login" && (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={reducedMotion ? { duration: 0.3 } : { type: "spring" as const, bounce: 0, duration: 0.45 }}
              className="auth-form-panel m-0 flex min-h-[100dvh] w-full flex-col"
            >
              <div className="auth-form-content">
                <motion.h1 {...heroSpring(0.08)} className="mt-10 text-center font-display font-black text-[clamp(2rem,5vw,2.6rem)] leading-[1.08] tracking-tight">
                  Welcome back.
                </motion.h1>
                <motion.p {...heroSpring(0.16)} className="mt-3 text-center text-[15px] font-sans text-[var(--theme-text-muted)] leading-relaxed">
                  Sign in to continue your farm.
                </motion.p>

                <motion.form {...heroSpring(0.24)} onSubmit={(e) => handleSubmit(e, "login")} className="mt-7 space-y-2.5">
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
                    className="text-[13px] font-sans font-semibold text-[var(--theme-accent)] hover:underline cursor-pointer"
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
                        Log In
                      </>
                    )}
                  </PrimaryButton>
                </div>
                </motion.form>

                <motion.div {...heroSpring(0.32)} className="border-t border-[var(--theme-card-border)] mt-7 pt-5 text-center text-sm font-sans text-[var(--theme-text-muted)]">
                  New here?{" "}
                  <button
                    type="button"
                    onClick={() => goTo("register")}
                    className="font-bold text-[var(--theme-accent)] hover:underline cursor-pointer"
                  >
                    Register
                  </button>
                </motion.div>
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
              transition={reducedMotion ? { duration: 0.3 } : { type: "spring" as const, bounce: 0, duration: 0.45 }}
              className="auth-form-panel m-0 flex min-h-[100dvh] w-full flex-col"
            >
              <div className="auth-form-content">
                <motion.h1 {...heroSpring(0.08)} className="mt-10 font-display font-black text-[clamp(2rem,5vw,2.6rem)] leading-[1.08] tracking-tight">
                Start your farm.
                </motion.h1>
                <motion.p {...heroSpring(0.16)} className="mt-3 text-[15px] font-sans text-[var(--theme-text-muted)] leading-relaxed">
                Choose a username, phone number, and password to get started.
                </motion.p>

                {regBonus > 0 && (
                  <motion.div {...heroSpring(0.24)} className="relative mt-4 overflow-hidden rounded-2xl bg-[var(--theme-primary)]/10 px-3 py-2 tile-shimmer-5s">
                    <p className="flex items-center gap-1.5 text-xs font-sans text-[var(--theme-primary)]">
                      <Gift className="w-12 h-12 text-[var(--theme-primary)]" />
                      Plus UGX {regBonus.toLocaleString()} Registration bonus upon first login.
                    </p>
                  </motion.div>
                )}

                <motion.form {...heroSpring(0.32)} onSubmit={(e) => handleSubmit(e, "register")} className="mt-5 space-y-2.5">
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
                    <p className="mt-1.5 text-xs font-sans text-[var(--theme-accent)] font-semibold">
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
                        Create Account
                      </>
                    )}
                  </PrimaryButton>
                </div>
                </motion.form>

                <motion.div {...heroSpring(0.4)} className="border-t border-[var(--theme-card-border)] mt-7 pt-5 text-center text-sm font-sans text-[var(--theme-text-muted)]">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => goTo("login")}
                    className="font-bold text-[var(--theme-accent)] hover:underline cursor-pointer"
                  >
                    Login
                  </button>
                </motion.div>
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
              transition={reducedMotion ? { duration: 0.3 } : { type: "spring" as const, bounce: 0, duration: 0.45 }}
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
                    <CheckCircle2 className="w-10 h-10 mx-auto text-[var(--theme-accent)]" />
                    <p className="mt-3 font-display font-black text-lg tracking-tight">Message sent.</p>
                    <p className="mt-2 text-[14px] font-sans text-[var(--theme-text-muted)] leading-relaxed">
                      If the username matches an account, support will reply using the contact details you provided.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setRecoverySent(false); setRecoveryMsg(""); }}
                      className="mt-4 text-[13px] font-sans font-semibold text-[var(--theme-accent)] hover:underline cursor-pointer"
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
                  className="text-[var(--theme-accent)] hover:underline"
                >
                  WhatsApp support
                </a>

                <a
                  href={activeConfig?.telegramLink || "https://t.me/#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--theme-accent)] hover:underline"
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
                  className="font-bold text-[var(--theme-accent)] hover:underline cursor-pointer"
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
