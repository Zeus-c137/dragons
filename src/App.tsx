/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { UserProfile, SubscriptionItem, SubscribedNode, SystemStats, NotificationItem } from "./types";
import AuthView from "./components/AuthView";
import DashboardView from "./components/DashboardView";
import CatalogView from "./components/CatalogView";
import IncomeView from "./components/IncomeView";
import CollectionView from "./components/CollectionView";
import DepositView from "./components/DepositView";
import WithdrawView from "./components/WithdrawView";
import ReferralView from "./components/ReferralView";
import ProfileView from "./components/ProfileView";
import BindAccountView from "./components/BindAccountView";
import GuideView from "./components/GuideView";
import ChatView from "./components/ChatView";
import TransactionHistoryView from "./components/TransactionHistoryView";
import VipTasksPage from "./components/VipTasksPage";
import StreaksPage from "./components/StreaksPage";
import AlertsView from "./components/AlertsView";
import AdminView from "./components/AdminView";
import { BrandLogo } from "./components/BrandLogo";
import { toast } from "sonner";
import { useCurrency } from "./currency";

import confetti from "canvas-confetti";
import {
  X,
  ArrowRight,
  ChevronLeft,
  Wallet
} from "lucide-react";

import activeRunsTutorialScreenshot from "@/src/assets/screenshots/activeruns.png";
import aiTutorialScreenshot from "@/src/assets/screenshots/ai.png";
import dailyTasksTutorialScreenshot from "@/src/assets/screenshots/dailytasks.png";
import depositWithdrawTutorialScreenshot from "@/src/assets/screenshots/depositwithdraw.png";
import referralsTutorialScreenshot from "@/src/assets/screenshots/invites.png";
import storeTutorialScreenshot from "@/src/assets/screenshots/store.png";
import streakTutorialScreenshot from "@/src/assets/screenshots/streak.png";
import homeNavIcon from "@/src/assets/svg/home.svg";
import depositNavIcon from "@/src/assets/svg/deposit.svg";
import withdrawNavIcon from "@/src/assets/svg/withdraw.svg";
import inviteNavIcon from "@/src/assets/svg/invite.svg";
import tractorNavIcon from "@/src/assets/svg/tractor.svg";
import { motion, AnimatePresence } from "motion/react";

import { ThemeProvider } from "./context/ThemeContext";
import { useGatedInterval, useGatedTimeout, useAbortSignal } from "./hooks/useGatedInterval";
import { fetchJsonWithSignal, abortableAll } from "./utils/abortableFetch";

// Last-known shell (theme preset + logo) cached on every successful site-config
// load. The boot splash reads it synchronously so the first paint already
// wears the active theme instead of flashing the light-preset default while
// the session and config are still being restored.
interface BootShell {
  themePreset?: string;
  themeMode?: string;
  logoUrl?: string;
  brandName?: string;
  bg?: string;
}

const BOOT_SHELL_KEY = "rentdue_boot_shell";

const WELCOME_TUTORIAL_SLIDES = [
  {
    title: "Deposit & withdraw",
    description: "Deposit with mobile money or crypto, activate a run, and claim its accumulated returns. Withdraw available funds to your mobile money or crypto wallet.",
    image: depositWithdrawTutorialScreenshot,
    imageAlt: "One account balance with Deposit and Withdraw actions",
  },
  {
    title: "Daily tasks",
    description: "Complete the available tasks to earn rewards. Open a task, follow its instructions, then claim when it is ready.",
    image: dailyTasksTutorialScreenshot,
    imageAlt: "Daily tasks with instructions and reward claim buttons",
  },
  {
    title: "Daily streaks",
    description: "Check in each day to keep your streak going and collect the reward for that day.",
    image: streakTutorialScreenshot,
    imageAlt: "A calendar showing daily streak progress and rewards",
  },
  {
    title: "The Store",
    description: "Activate a product with 'Start Run'. Its daily returns accumulate during the cycle and can be claimed from Active Runs.",
    image: storeTutorialScreenshot,
    imageAlt: "The Store with available runs",
  },
  {
    title: "My Runs",
    description: "Track the progress and earnings of your active runs from one place.",
    image: activeRunsTutorialScreenshot,
    imageAlt: "Active runs with progress and earnings",
  },
  {
    title: "Referrals",
    description: "Share your referral link with friends. Verified referrals can earn you commission.",
    image: referralsTutorialScreenshot,
    imageAlt: "Referral earnings and friends referred",
  }
] as const;

function getLocalDateKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function getTutorialPreferenceKey(phone: string, preference: "completed" | "opted-out" | "last-shown") {
  return `rentdue_tutorial_${preference}_${phone}`;
}

function readTutorialPreference(key: string) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn("Unable to read tutorial preference:", error);
    return null;
  }
}

function writeTutorialPreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn("Unable to save tutorial preference:", error);
  }
}

function readBootShell(): BootShell | null {
  try {
    const raw = localStorage.getItem(BOOT_SHELL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const shell: BootShell = {};
    for (const key of ["themePreset", "themeMode", "logoUrl", "brandName", "bg"] as const) {
      if (typeof parsed[key] === "string" && parsed[key]) shell[key] = parsed[key];
    }
    return Object.keys(shell).length > 0 ? shell : null;
  } catch {
    return null;
  }
}

function writeBootShell(config: any) {
  try {
    const shell: BootShell = {};
    if (typeof config?.themePreset === "string" && config.themePreset) shell.themePreset = config.themePreset;
    if (typeof config?.themeMode === "string" && config.themeMode) shell.themeMode = config.themeMode;
    if (typeof config?.logoUrl === "string" && config.logoUrl) shell.logoUrl = config.logoUrl;
    if (typeof config?.brandName === "string" && config.brandName) shell.brandName = config.brandName;
    // Resolved background (already applied by the theme layout effect), so an
    // inline pre-React script can paint it before the first frame.
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--theme-bg").trim();
    if (bg) shell.bg = bg;
    if (Object.keys(shell).length > 0) {
      localStorage.setItem(BOOT_SHELL_KEY, JSON.stringify(shell));
    }
  } catch {
    // caching must never break the app
  }
}

export default function App() {
  const { formatCurrency } = useCurrency();
  const [isAdminRoute, setIsAdminRoute] = useState(
    window.location.pathname.startsWith("/admin/access") || window.location.hash.startsWith("#/admin/access")
  );

  useEffect(() => {
    const handleUrlChange = () => {
      const isAdm = window.location.pathname.startsWith("/admin/access") || window.location.hash.startsWith("#/admin/access");
      setIsAdminRoute(isAdm);
      
      // Enforce session isolation
      if (isAdm) {
        // User sessions are HttpOnly cookies and are deliberately not copied
        // into localStorage. AdminView validates its own separate cookie.
      } else {
        // If entering user space, clear admin session
        localStorage.removeItem("hut8_admin_active");
      }
    };
    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("hashchange", handleUrlChange);
    
    // Initial check
    handleUrlChange();
    
    return () => {
      window.removeEventListener("popstate", handleUrlChange);
      window.removeEventListener("hashchange", handleUrlChange);
    };
  }, []);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  // The server owns the signed HttpOnly cookie. Restore the profile from it
  // before rendering the login screen, so a refresh is not treated as logout.
  useEffect(() => {
    if (isAdminRoute) {
      setIsRestoringSession(false);
      return;
    }

    let cancelled = false;
    setIsRestoringSession(true);
    fetch("/api/auth/session", {
      credentials: "same-origin",
      cache: "no-store"
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((data) => {
        if (!cancelled && data?.authenticated && data.profile) {
          setUserProfile(data.profile);
        }
      })
      .catch((error) => {
        if (!cancelled) console.warn("Unable to restore the user session:", error);
      })
      .finally(() => {
        if (!cancelled) setIsRestoringSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAdminRoute]);
  const [activeTab, setActiveTab] = useState<"dashboard" | "catalog" | "income" | "collection" | "history" | "referral" | "chat" | "profile" | "account" | "guide" | "deposit" | "withdraw" | "alerts" | "vip" | "streaks">("dashboard");
  const [historyFilterRequest, setHistoryFilterRequest] = useState<string | null>(null);
  const [journeyStage, setJourneyStage] = useState<string | null>(null);
  const [referralView, setReferralView] = useState<"overview" | "team">("overview");
  const [streaksReturn, setStreaksReturn] = useState<"dashboard" | "profile">("dashboard");
  const [collectionReturn, setCollectionReturn] = useState<"dashboard" | "income" | "profile">("profile");
  const [siteConfig, setSiteConfig] = useState<any>(null);
  // Synchronous boot seed: theme + logo from the last successful load so the
  // splash and first paint already match the active preset.
  const [bootShell] = useState<BootShell | null>(readBootShell);
  const themeSeed = useMemo(
    () => siteConfig ?? (bootShell ? { themePreset: bootShell.themePreset, themeMode: bootShell.themeMode } : null),
    [siteConfig, bootShell]
  );

  // Refresh the cached shell whenever live config lands.
  useEffect(() => {
    if (siteConfig) writeBootShell(siteConfig);
  }, [siteConfig]);
  const [userNotifications, setUserNotifications] = useState<NotificationItem[]>([]);
  const [welcomeModalMode, setWelcomeModalMode] = useState<"bonus" | "tutorial" | null>(null);
  const [welcomeBonusAmount, setWelcomeBonusAmount] = useState(0);
  const [welcomePendingMode, setWelcomePendingMode] = useState<"bonus" | "tutorial" | null>(null);
  const [welcomeTutorialIndex, setWelcomeTutorialIndex] = useState(-1);
  const showWelcomeModal = welcomeModalMode !== null;
  useGatedTimeout(() => {
    if (!welcomePendingMode || document.hidden) return;
    setWelcomeModalMode(welcomePendingMode);
    setWelcomePendingMode(null);
    if (userProfile?.id) {
      writeTutorialPreference(
        getTutorialPreferenceKey(userProfile.id, "last-shown"),
        getLocalDateKey()
      );
    }
  }, 2000, [welcomePendingMode, userProfile?.id]);

  // A first-login tutorial is shown once each day until completed or opted out.
  useEffect(() => {
    if (!userProfile?.id) {
      setWelcomeModalMode(null);
      setWelcomeBonusAmount(0);
      setWelcomePendingMode(null);
      setWelcomeTutorialIndex(-1);
      return;
    }

    const phone = userProfile.id;
    const completed = readTutorialPreference(getTutorialPreferenceKey(phone, "completed")) === "1";
    const optedOut = readTutorialPreference(getTutorialPreferenceKey(phone, "opted-out")) === "1";
    const lastShownToday = readTutorialPreference(getTutorialPreferenceKey(phone, "last-shown")) === getLocalDateKey();
    if (completed || optedOut || lastShownToday) {
      setWelcomeModalMode(null);
      setWelcomePendingMode(null);
      setWelcomeBonusAmount(0);
      setWelcomeTutorialIndex(-1);
      return;
    }

    const welcomeKey = `pending_welcome_bonus_${userProfile.id}`;
    let pendingBonus: { amount?: number; issuedAt?: number } | null = null;
    try {
      const rawPendingBonus = sessionStorage.getItem(welcomeKey);
      pendingBonus = rawPendingBonus ? JSON.parse(rawPendingBonus) : null;
    } catch {
      pendingBonus = null;
    }

    const amount = Number(pendingBonus?.amount || 0);
    const issuedAt = Number(pendingBonus?.issuedAt || 0);
    const isFreshHandoff = issuedAt > 0 && Date.now() - issuedAt <= 15 * 60 * 1000;
    if (amount <= 0 || !isFreshHandoff) {
      sessionStorage.removeItem(welcomeKey);
      setWelcomeBonusAmount(0);
      setWelcomeTutorialIndex(0);
      setWelcomePendingMode("tutorial");
    } else {
      setWelcomeBonusAmount(amount);
      setWelcomeTutorialIndex(-1);
      setWelcomePendingMode("bonus");
    }

  }, [userProfile?.id]);

  useEffect(() => {
    if (showWelcomeModal) {
      confetti({
        particleCount: 75,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }, [showWelcomeModal]);

  const handleCloseWelcomeModal = () => {
    if (userProfile?.id) {
      sessionStorage.removeItem(`pending_welcome_bonus_${userProfile.id}`);
    }
    setWelcomeModalMode(null);
    setWelcomeTutorialIndex(-1);
  };

  const handleCompleteWelcomeTutorial = () => {
    if (userProfile?.id) {
      sessionStorage.removeItem(`pending_welcome_bonus_${userProfile.id}`);
      writeTutorialPreference(getTutorialPreferenceKey(userProfile.id, "completed"), "1");
    }
    setWelcomeModalMode(null);
    setWelcomePendingMode(null);
    setWelcomeTutorialIndex(-1);
  };

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/config/site", { signal: ctrl.signal })
      .then(r => r.json())
      .then(data => {
        if (!ctrl.signal.aborted && !data.error) {
          setSiteConfig(data);
        }
      })
      .catch(err => { if (err?.name !== "AbortError") console.error("Failed to fetch site config", err); });
    return () => ctrl.abort();
  }, []);

  // Hidden override fix: refetch siteConfig when admin saves (same tab via custom event + other tabs via storage) — throttled focus 60s
  useEffect(() => {
    const refresh = () => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - lastFocusSiteFetch.current < 60000) return;
      lastFocusSiteFetch.current = now;
      fetch("/api/config/site")
        .then(r => r.json())
        .then(data => { if (!data.error) setSiteConfig(data); })
        .catch(() => {});
    };
    const onStorage = (e: StorageEvent) => { if (e.key === "siteConfigUpdatedAt") refresh(); };
    const onCustom = () => refresh();
    const onFocus = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("siteConfigUpdated", onCustom as unknown as EventListener);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("siteConfigUpdated", onCustom as unknown as EventListener);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (siteConfig?.brandName) {
      document.title = siteConfig.brandName;
    }
    if (siteConfig?.logoUrl) {
      let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      const url = siteConfig.logoUrl.trim();
      const isSvg = url.toLowerCase().includes("<svg") || url.startsWith("<");
      if (isSvg) {
        link.href = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(url)));
      } else {
        link.href = url;
      }
    }
  }, [siteConfig]);

  const [previousTab, setPreviousTab] = useState<"dashboard" | "catalog" | "income" | "collection" | "history" | "referral" | "chat" | "profile" | "account" | "guide" | "deposit" | "withdraw" | "alerts" | "vip" | "streaks">("dashboard");

  useEffect(() => {
    if (activeTab !== "history" && !(activeTab === "alerts" && previousTab === "history")) {
      setHistoryFilterRequest(null);
    }
  }, [activeTab, previousTab]);

  useEffect(() => {
    if (activeTab !== "alerts") {
      setPreviousTab(activeTab as any);
    }
  }, [activeTab]);

  // Leaving the journey resets the deep link: coming back always lands on
  // the tier list, never a stale stage detail. The alerts overlay keeps the
  // underlying tab mounted, so focus survives a peek at alerts.
  const vipVisible = activeTab === "vip" || (activeTab === "alerts" && previousTab === "vip");
  useEffect(() => {
    if (!vipVisible) setJourneyStage(null);
  }, [vipVisible]);
  const [chatRoomDefault, setChatRoomDefault] = useState<"shared" | "admin" | "ai">("shared");
  const [autoOpenWithdraw, setAutoOpenWithdraw] = useState(false);
  const [preselectedGpuRent, setPreselectedGpuRent] = useState<SubscriptionItem | null>(null);
  
  // Data lists
  const [items, setItems] = useState<SubscriptionItem[]>([]);
  const [activeNodes, setActiveNodes] = useState<SubscribedNode[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats | undefined>(undefined);
  
  // 5-minute inactivity auto sign out for users
  const revokeUserSession = () => {
    void fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store"
    }).catch(() => undefined);
  };

  useEffect(() => {
    if (!userProfile || isAdminRoute) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let rafId: number | null = null;
    let ticking = false;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        revokeUserSession();
        setUserProfile(null);
        setActiveTab("dashboard");
        toast.info("You have been signed out due to inactivity.");
      }, 5 * 60 * 1000); // 5 minutes
    };

    const throttledReset = () => {
      if (ticking) return;
      ticking = true;
      rafId = requestAnimationFrame(() => {
        ticking = false;
        resetTimer();
      });
    };

    const activityEvents = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
    activityEvents.forEach((event) => {
      window.addEventListener(event, throttledReset);
    });

    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      if (rafId !== null) cancelAnimationFrame(rafId);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, throttledReset);
      });
    };
  }, [userProfile, isAdminRoute]);

  // Fetch lists and stats once user is active
  const abortRef = useRef<AbortController | null>(null);
  const lastFocusSiteFetch = useRef<number>(0);
  const _abortSignal = useAbortSignal(); void _abortSignal;

  const applyUserDataResults = useCallback((results: Record<string, unknown>) => {
    const setters: Record<string, (d: unknown) => void> = {
      items: (d) => setItems(d as SubscriptionItem[]),
      subs: (d) => setActiveNodes(d as SubscribedNode[]),
      stats: (d) => setSystemStats(d as SystemStats),
      notifs: (d) => setUserNotifications(d as NotificationItem[]),
    };
    for (const [k, v] of Object.entries(results)) {
      const setter = setters[k];
      if (setter && v !== undefined) setter(v);
    }
  }, []);

  const fetchUserDataAndCatalog = useCallback(async (phone: string) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const signal = ctrl.signal;
    if (document.hidden) return;
    try {
      const tasks: Array<(s: AbortSignal) => Promise<unknown>> = [
        (s) => fetchJsonWithSignal<SubscriptionItem[]>("/api/items", s),
        (s) => fetchJsonWithSignal<SubscribedNode[]>(`/api/subscriptions/${phone}`, s),
        (s) => fetchJsonWithSignal<SystemStats>("/api/system/stats", s),
        (s) => fetchJsonWithSignal<NotificationItem[]>(`/api/profile/notifications/${phone}`, s),
        (s) => fetchJsonWithSignal<UserProfile>(`/api/profile/${phone}`, s),
        (s) => fetchJsonWithSignal<unknown>("/api/config/site", s),
      ];
      const [itemsData, subsData, statsData, notifData, profileData, siteData] = await abortableAll(tasks, signal) as [unknown, unknown, unknown, unknown, unknown, unknown];
      if (signal.aborted) return;
      applyUserDataResults({
        items: itemsData,
        subs: subsData,
        stats: statsData,
        notifs: notifData,
      });
      if (profileData) setUserProfile(profileData as UserProfile);
      if (siteData && !(siteData as { error?: unknown }).error) setSiteConfig(siteData);
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") return;
      console.error("Failed to sync backend endpoints:", e);
    }
  }, [applyUserDataResults]);

  useEffect(() => {
    if (userProfile && !isAdminRoute) {
      void fetchUserDataAndCatalog(userProfile.id);
    }
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [userProfile?.id, isAdminRoute, fetchUserDataAndCatalog]);

  useGatedInterval(() => {
    if (userProfile?.id && !isAdminRoute) void fetchUserDataAndCatalog(userProfile.id);
  }, 60000, { enabled: !!userProfile?.id && !isAdminRoute, visibilityGate: true, runOnVisible: true });

  const handleAuthSuccess = (profile: UserProfile) => {
    setUserProfile(profile);
  };

  const handleLogout = () => {
    if (userProfile?.id) {
      sessionStorage.removeItem(`pending_welcome_bonus_${userProfile.id}`);
    }
    setUserProfile(null);
    revokeUserSession();
    setActiveTab("dashboard");
  };

  const handleProfileChange = (newProfile: UserProfile) => {
    setUserProfile(newProfile);
  };

  // Callback on successful active subscription activation. State only —
  // Catalog shows the activation modal and the user continues deliberately.
  const handleSubscribeSuccess = (newSub: SubscribedNode, costAmt: number) => {
    if (userProfile) {
      const updatedProfile = {
        ...userProfile,
        points: Math.max(0, (userProfile.points || 0) - costAmt) + (Number(newSub.totalEarned) || 0),
        rechargeableBalance: Math.max(0, (Number(userProfile.rechargeableBalance) || 0) - costAmt),
        withdrawableBalance: (Number(userProfile.withdrawableBalance) || 0) + (Number(newSub.totalEarned) || 0),
      };
      setUserProfile(updatedProfile);
    }
    setActiveNodes((prev) => [newSub, ...prev]);
    // Refresh system global counts
    fetch("/api/system/stats")
      .then((res) => res.json())
      .then(setSystemStats)
      .catch((e) => console.log(e));
  };

  const handleDepositSuccess = (newProfile: UserProfile) => {
    setUserProfile(newProfile);
  };

  const handleGpuSuccess = (newSub: any, CostAmount: number) => {
    setPreselectedGpuRent(null);
    setActiveNodes((prev) => [newSub, ...prev]);
    // Refresh system stats
    handleManualStatsRefresh();
    // Redirect to Income tab
    setActiveTab("income");
  };

  // Callback on manual points claims harvesting succeed
  const handleClaimSuccess = (_pointsEarned: number, newBalance: number, subId: string, lastClaimedDate: string, status: "active" | "expired", newWithdrawableBalance?: number, daysFed?: number) => {
    setUserProfile((current) => current ? {
      ...current,
      points: Math.max(Number(current.points) || 0, Number(newBalance) || 0),
      withdrawableBalance: Math.max(Number(current.withdrawableBalance) || 0, Number(newWithdrawableBalance) || 0),
    } : current);
    // Keep the local run card in sync without refetching the full signed-in shell.
    setActiveNodes((prev) =>
      prev.map((n) =>
        n.id === subId
          ? {
              ...n,
              status,
              lastClaimedDate,
              daysFed: Number(daysFed ?? n.daysFed ?? 0),
              totalEarned: (n.totalEarned || 0) + _pointsEarned
            }
          : n
      )
    );
    // Refresh stats from server
    handleManualStatsRefresh();
  };

  // Refresh whole dashboard — consolidated to single fetchUserDataAndCatalog (already includes referrals+stats)
  const handleManualStatsRefresh = useCallback(async () => {
    if (userProfile) {
      await fetchUserDataAndCatalog(userProfile.id);
    }
  }, [userProfile, fetchUserDataAndCatalog]);

  const renderContent = () => {
    if (!isAdminRoute && isRestoringSession) {
      const splashConfig = siteConfig ?? (bootShell ? { logoUrl: bootShell.logoUrl, brandName: bootShell.brandName } : null);
      // Never show the fallback mark here: it flashes for a frame before the
      // real logo arrives. No known logo yet = empty stage, logo pops in.
      const splashLogoUrl = (splashConfig as any)?.logoUrl;
      return (
        <div
          role="status"
          aria-label="Loading"
          className="min-h-screen bg-[var(--theme-bg)] flex items-center justify-center"
        >
          {splashLogoUrl ? (
            <BrandLogo
              siteConfig={splashConfig}
              className="w-20 h-20 flex items-center justify-center shrink-0 splash-logo-pulse [&>img]:rounded-2xl"
            />
          ) : (
            <div className="w-20 h-20" aria-hidden="true" />
          )}
        </div>
      );
    }

    if (isAdminRoute) {
      return <AdminView />;
    }

    if (!userProfile) {
      return <AuthView onAuthSuccess={handleAuthSuccess} siteConfig={siteConfig} />;
    }

    return null; // main content rendered below
  };

  const isMainApp = !isAdminRoute && !isRestoringSession && !!userProfile;

  return (
    <ThemeProvider siteConfig={themeSeed}>
      {!isMainApp ? renderContent() : (
      <div className="relative h-[100dvh] w-full bg-[var(--theme-bg)] text-[var(--theme-text)] font-sans selection:bg-blue-600/35 selection:text-white overflow-hidden flex items-center justify-center p-0 md:p-4">
      

      {/* Registration bonus handoff and first-use tutorial. */}
      <AnimatePresence>
        {showWelcomeModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ scale: 0.95, y: 8, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 8, opacity: 0 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="welcome-modal-title"
              className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-[var(--theme-radius)] border border-white/10 bg-[var(--theme-card-bg)]/40 text-[var(--theme-text)] shadow-2xl backdrop-blur-[20px] backdrop-saturate-[180%] z-[210] font-[var(--theme-font-family)]"
            >
              <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[var(--theme-primary)]/20 to-transparent pointer-events-none" />

              <button
                type="button"
                onClick={handleCloseWelcomeModal}
                aria-label="Close welcome and tutorial"
                className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--theme-card-border)] bg-[var(--theme-bg)]/90 text-[var(--theme-text)] opacity-70 transition-all hover:opacity-100 active:scale-95 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              {welcomeTutorialIndex < 0 ? (
                <div className="relative flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 pb-6 pt-12 text-center sm:px-8">
                  <BrandLogo
                    siteConfig={siteConfig}
                    className="relative z-10 h-16 w-16 shrink-0"
                  />
                  <div className="relative z-10 space-y-2">
                    <h3 id="welcome-modal-title" className="font-display text-2xl font-black tracking-tight">WELCOME</h3>
                    <p className="mx-auto max-w-xs text-sm leading-relaxed opacity-75">
                      A registration bonus of <span className="font-black text-[var(--theme-primary)]">UGX {welcomeBonusAmount.toLocaleString()}</span> has been added to your balance.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWelcomeTutorialIndex(0)}
                    className="relative z-10 mt-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--theme-primary)] px-5 py-3 text-sm font-sans font-black text-[var(--theme-on-primary)] transition-transform active:scale-[0.97] cursor-pointer"
                  >
                    Start tutorial <ArrowRight className="h-4 w-4" strokeWidth={3} />
                  </button>
                </div>
              ) : (
                (() => {
                  const tutorialIndex = Math.min(
                    Math.max(welcomeTutorialIndex, 0),
                    WELCOME_TUTORIAL_SLIDES.length - 1
                  );
                  const slide = WELCOME_TUTORIAL_SLIDES[tutorialIndex];
                  const isLastSlide = tutorialIndex === WELCOME_TUTORIAL_SLIDES.length - 1;
                  return (
                    <div className="relative flex min-h-0 flex-1 flex-col px-4 pb-4 pt-14 sm:px-6 sm:pb-5">
                      <div className="mb-3 flex items-center justify-between pr-11">
                        <p className="text-[20px] font-sans  text-[var(--theme-primary)]">
                          Cash Dragons Tutorial
                        </p>
                        <span className="text-[11px] font-sans font-bold tabular-nums opacity-55">
                          {tutorialIndex + 1} / {WELCOME_TUTORIAL_SLIDES.length}
                        </span>
                      </div>
                      <div className="relative min-h-0 flex-1">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={tutorialIndex}
                            initial={{ opacity: 0, x: 18 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -18 }}
                            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                            className="flex h-full min-h-0 flex-col"
                          >
                            <div className="flex h-[40dvh] min-h-[120px] max-h-[350px] shrink-0 items-center justify-center overflow-hidden rounded-2xl p-2">
                              <img
                                src={slide.image}
                                alt={slide.imageAlt}
                                className={tutorialIndex === 3
                                  ? "h-full w-full object-contain"
                                  : "h-full w-full object-contain"}
                                loading="eager"
                              />
                            </div>
                            <div className="min-h-0 flex-1 px-1 pt-4">
                              <h3 id="welcome-modal-title" className="font-display text-xl font-black tracking-tight">
                                {slide.title}
                              </h3>
                              <p className="mt-1.5 text-[13px] leading-relaxed opacity-70">
                                {slide.description}
                              </p>
                            </div>
                          </motion.div>
                        </AnimatePresence>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        {welcomeTutorialIndex > 0 ? (
                          <button
                            type="button"
                            onClick={() => setWelcomeTutorialIndex((index) => Math.max(0, index - 1))}
                            className="inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-xs font-sans font-bold opacity-70 transition-opacity hover:opacity-100 cursor-pointer"
                          >
                            <ChevronLeft className="h-4 w-4" /> Back
                          </button>
                        ) : (
                          <span className="min-h-10 px-3" aria-hidden="true" />
                        )}
                        <div className="flex items-center gap-1.5" aria-label={`Tutorial step ${tutorialIndex + 1} of ${WELCOME_TUTORIAL_SLIDES.length}`}>
                          {WELCOME_TUTORIAL_SLIDES.map((item, index) => (
                            <span
                              key={item.title}
                              className={`h-1.5 rounded-full transition-all ${index === tutorialIndex ? "w-5 bg-[var(--theme-primary)]" : "w-1.5 bg-[var(--theme-text)]/25"}`}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (isLastSlide) {
                              handleCompleteWelcomeTutorial();
                            } else {
                              setWelcomeTutorialIndex((index) => Math.min(index + 1, WELCOME_TUTORIAL_SLIDES.length - 1));
                            }
                          }}
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-[var(--theme-primary)] px-4 text-xs font-sans font-black text-[var(--theme-on-primary)] transition-transform active:scale-[0.97] cursor-pointer"
                        >
                          {isLastSlide ? "Done" : "Next"}
                          {!isLastSlide && <ArrowRight className="h-3.5 w-3.5" strokeWidth={3} />}
                        </button>
                      </div>
                    </div>
                  );
                })()
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main application layout */}
      <div 
        className="relative w-full max-w-xl md:max-w-3xl h-full md:h-[94vh] bg-[var(--theme-bg)] flex flex-col overflow-hidden z-10 font-[var(--theme-font-family)]"
        style={{
          fontFamily: "var(--theme-font-family), 'Plus Jakarta Sans', sans-serif",
          fontSize: "var(--theme-font-base)",
        }}
      >
        
        <header className="user-app-header sticky top-0 z-40 shrink-0">
          <div className="user-app-brand">
            <button
              type="button"
              onClick={() => { setHistoryFilterRequest("all"); setActiveTab("history"); }}
              aria-label={`Open transaction history. My capital ${formatCurrency(Number(userProfile.rechargeableBalance) || 0)}`}
              className="user-app-capital appearance-none border-0 bg-transparent p-0 text-inherit text-left cursor-pointer transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-on-primary)]"
            >
              <span><Wallet className="h-3.5 w-3.5" aria-hidden="true" />My capital</span>
              <strong>{formatCurrency(Number(userProfile.rechargeableBalance) || 0)}</strong>
            </button>
          </div>
          <div className="user-app-header-actions">
            <button
              type="button"
              onClick={() => { setHistoryFilterRequest("all"); setActiveTab("history"); }}
              aria-label={`Open transaction history. Withdrawable balance ${formatCurrency(Number(userProfile.withdrawableBalance) || 0)}`}
              className="user-app-balance user-app-withdrawable-balance appearance-none border-0 bg-transparent p-0 text-inherit cursor-pointer transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-on-primary)]"
            >
              <span className="inline-flex items-center justify-end gap-1.5"><Wallet className="h-3.5 w-3.5" aria-hidden="true" />Withdrawable</span>
              <strong>{formatCurrency(Number(userProfile.withdrawableBalance) || 0)}</strong>
            </button>
          </div>
        </header>

        {/* Main interactive tabs content view block */}
        <main className="flex-1 relative min-h-0 flex flex-col isolate overflow-hidden"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <AnimatePresence mode="wait" initial={false}>
            {(activeTab === "dashboard" || (activeTab === "alerts" && previousTab === "dashboard")) && (
              <motion.div
                key="dash"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-1.5 sm:px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <DashboardView
                  isHomeActive={activeTab === "dashboard"}
                  profile={userProfile}
                  activeNodes={activeNodes}
                  items={items}
                  onSubscribeSuccess={handleSubscribeSuccess}
                  onClaimSuccess={handleClaimSuccess}
                  onProfileUpdate={handleProfileChange}
                  onNavigateToCollection={() => { setCollectionReturn("dashboard"); setActiveTab("collection"); }}
                  onNavigateToHistory={() => { setHistoryFilterRequest("all"); setActiveTab("history"); }}
                  onSignOut={handleLogout}
                />
              </motion.div>
            )}

            {(activeTab === "catalog" || (activeTab === "alerts" && previousTab === "catalog")) && (
              <motion.div
                key="cat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-1.5 sm:px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <CatalogView
                  items={items}
                  userProfile={userProfile}
                  siteConfig={siteConfig}
                  activeSubscriptions={activeNodes}
                  onRentWithMmoney={(item) => {
                    setPreselectedGpuRent(item);
                    setActiveTab("deposit");
                  }}
                  onSubscribeSuccess={handleSubscribeSuccess}
                  onActivationContinue={() => setActiveTab("income")}
                  onNavigateToDeposit={() => setActiveTab("deposit")}
                />
              </motion.div>
            )}

            {(activeTab === "income" || (activeTab === "alerts" && previousTab === "income")) && (
              <motion.div
                key="inc"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-1.5 sm:px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <IncomeView
                  profile={userProfile}
                  activeNodes={activeNodes}
                  items={items}
                  onNavigateToCatalog={() => setActiveTab("catalog")}
                  onNavigateToIncomeHistory={() => { setHistoryFilterRequest("yield"); setActiveTab("history"); }}
                  onNavigateToCollection={() => { setCollectionReturn("income"); setActiveTab("collection"); }}
                  onCollectibleClaimed={() => { void handleManualStatsRefresh(); }}
                  onClaimSuccess={handleClaimSuccess}
                  onRenew={(item) => {
                    setPreselectedGpuRent(item);
                    setActiveTab("deposit");
                  }}
                />
              </motion.div>
            )}

            {(activeTab === "collection" || (activeTab === "alerts" && previousTab === "collection")) && (
              <motion.div
                key="coll"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-1.5 sm:px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <CollectionView
                  phone={userProfile.id}
                  activeNodes={activeNodes}
                  products={items}
                  onClaimSuccess={handleClaimSuccess}
                  onBack={() => setActiveTab(collectionReturn)}
                  onClaimed={() => { void handleManualStatsRefresh(); }}
                />
              </motion.div>
            )}

            {(activeTab === "history" || (activeTab === "alerts" && previousTab === "history")) && (
              <motion.div
                key="hist"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 h-full flex flex-col overflow-hidden"
              >
                <TransactionHistoryView phone={userProfile.id} siteConfig={siteConfig} initialFilter={historyFilterRequest || "all"} onBack={() => setActiveTab("profile")} />
              </motion.div>
            )}

            {(activeTab === "deposit" || (activeTab === "alerts" && previousTab === "deposit")) && (
              <motion.div
                key="dep"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <DepositView
                  userProfile={userProfile}
                  items={items}
                  siteConfig={siteConfig}
                  onDepositSuccess={handleDepositSuccess}
                  onGpuSuccess={handleGpuSuccess}
                  preselectedItem={preselectedGpuRent}
                />
              </motion.div>
            )}

            {(activeTab === "withdraw" || (activeTab === "alerts" && previousTab === "withdraw")) && (
              <motion.div
                key="wit"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <WithdrawView
                  userProfile={userProfile}
                  siteConfig={siteConfig}
                  activeNodes={activeNodes}
                  onProfileUpdate={handleProfileChange}
                />
              </motion.div>
            )}

            {(activeTab === "referral" || (activeTab === "alerts" && previousTab === "referral")) && (
              <motion.div
                key="ref"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-1.5 sm:px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <ReferralView
                  userProfile={userProfile}
                  siteConfig={siteConfig}
                  initialView={referralView}
                  onProfileChange={handleProfileChange}
                />
              </motion.div>
            )}

            {(activeTab === "chat" || (activeTab === "alerts" && previousTab === "chat")) && (
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 flex flex-col min-h-0 h-full overflow-hidden"
              >
                <ChatView userProfile={userProfile} initialRoom={chatRoomDefault} canUpload={userProfile.phone === siteConfig?.adminPhone} brandName={siteConfig?.brandName} activeNodes={activeNodes} siteConfig={siteConfig} />
              </motion.div>
            )}

            {activeTab === "streaks" && (
              <motion.div
                key="streaks"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 h-full flex flex-col overflow-hidden"
              >
                <StreaksPage phone={userProfile.id} userProfile={userProfile} siteConfig={siteConfig} onClaimSuccess={handleProfileChange} onBack={() => setActiveTab(streaksReturn)} />
              </motion.div>
            )}

            {(activeTab === "vip" || (activeTab === "alerts" && previousTab === "vip")) && (              <motion.div
                key="vip"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 h-full flex flex-col overflow-hidden"
              >
                <VipTasksPage phone={userProfile.id} siteConfig={siteConfig} userProfile={userProfile} onClaimSuccess={handleProfileChange} onBack={() => setActiveTab("profile")} focusStage={journeyStage} />
              </motion.div>
            )}

            {(activeTab === "guide" || (activeTab === "alerts" && previousTab === "guide")) && (
              <motion.div
                key="guide"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-1.5 sm:px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <GuideView
                  siteConfig={siteConfig}
                  onBack={() => setActiveTab("profile")}
                />
              </motion.div>
            )}

            {(activeTab === "account" || (activeTab === "alerts" && previousTab === "account")) && (
              <motion.div
                key="account"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-1.5 sm:px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <BindAccountView
                  userProfile={userProfile!}
                  onProfileUpdate={handleProfileChange}
                  onBack={() => setActiveTab("profile")}
                  onGoHome={() => setActiveTab("dashboard")}
                />
              </motion.div>
            )}

            {(activeTab === "profile" || (activeTab === "alerts" && previousTab === "profile")) && (
              <motion.div
                key="prof"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-1.5 sm:px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <ProfileView
                  userProfile={userProfile!}
                  siteConfig={siteConfig}
                  activeNodes={activeNodes}
                  notifications={userNotifications}
                  onProfileUpdate={handleProfileChange}
                  onNavigateToDeposit={() => setActiveTab("deposit")}
                  onNavigateToWithdraw={() => setActiveTab("withdraw")}
                  onNavigateToTeamRevenue={() => { setReferralView("team"); setActiveTab("referral"); }}
                  autoOpenWithdraw={autoOpenWithdraw}
                  onCloseAutoWithdraw={() => setAutoOpenWithdraw(false)}
                  onNavigate={(tab, room) => {
                    if (tab === "streaks") {
                      setStreaksReturn("profile");
                    }
                    if (tab === "referral") {
                      setReferralView("overview");
                    }
                    if (room) {
                      setChatRoomDefault(room);
                    } else {
                      setChatRoomDefault("shared");
                    }
                    setActiveTab(tab as any);
                  }}
                  onLogout={handleLogout}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Alerts Bottom Sheet Overlay */}
        <AnimatePresence>
          {activeTab === "alerts" && (
            <div className="absolute inset-0 z-50 flex flex-col justify-end overflow-hidden">
              {/* Blur Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.65 }}
                exit={{ opacity: 0 }}
                onClick={() => setActiveTab(previousTab)}
                className="absolute inset-0 bg-black/70 backdrop-blur-xs cursor-pointer"
              />
              {/* The Bottom Sheet Body */}
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="relative w-full h-[96vh] max-h-[96vh] bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-t-[var(--theme-radius)] flex flex-col overflow-hidden z-10 shadow-2xl"
              >
                {/* Drag Handle + Close */}
                <div className="flex items-center justify-center relative py-3 shrink-0">
                  <div className="w-10 h-1.5 bg-[var(--theme-card-border)] rounded-full" />
                  <button
                    onClick={() => setActiveTab(previousTab)}
                    className="absolute right-4 p-1.5 rounded-full btn-3d-secondary border border-[var(--theme-card-border)] text-[var(--theme-text)] cursor-pointer focus:outline-none"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-none pb-6">
                  <AlertsView
                    profile={userProfile!}
                    siteConfig={siteConfig}
                    initialNotifications={userNotifications}
                    onBack={() => setActiveTab(previousTab)}
                    onNotificationsChange={setUserNotifications}
                  />
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Primary destinations: the farm, collections, wallet actions, and friends */}
          <nav aria-label="Main navigation" className="user-app-bottom-nav grid grid-cols-5 items-end shrink-0 z-40 select-none">
            <button
              type="button"
              onClick={() => setActiveTab("dashboard")}
              aria-current={activeTab === "dashboard" ? "page" : undefined}
              className={`user-app-nav-item flex flex-col items-center gap-1 py-2 px-1 rounded-xl border-0 transition-colors active:scale-[0.97] ${activeTab === "dashboard" ? "is-active" : ""}`}
            >
              <span className="grid place-items-center w-10 h-10">
                <img src={homeNavIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
              </span>
              <span className="text-[9px] sm:text-[10px] font-sans font-black uppercase tracking-wide leading-none">The Farm</span>
              
            </button>
            <button
              type="button"
              onClick={() => { setCollectionReturn("dashboard"); setActiveTab("collection"); }}
              aria-current={activeTab === "collection" ? "page" : undefined}
              className={`user-app-nav-item flex flex-col items-center gap-1 py-2 px-1 rounded-xl border-0 transition-colors active:scale-[0.97] ${activeTab === "collection" ? "is-active" : ""}`}
            >
              <span className="grid place-items-center w-10 h-10">
                <img src={tractorNavIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
              </span>
              <span className="text-[9px] sm:text-[10px] font-sans font-black uppercase tracking-wide leading-none">My chicks</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("deposit")}
              aria-current={activeTab === "deposit" ? "page" : undefined}
              className={`user-app-nav-item flex flex-col items-center gap-1 py-2 px-1 rounded-xl border-0 transition-colors active:scale-[0.97] ${activeTab === "deposit" ? "is-active" : ""}`}
            >
              <span className="grid h-10 w-10 place-items-center">
                <img src={depositNavIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
              </span>
              <span className="text-[9px] sm:text-[10px] font-sans font-black uppercase tracking-wide leading-none">Top up</span>
           
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("withdraw")}
              aria-current={activeTab === "withdraw" ? "page" : undefined}
              className={`user-app-nav-item flex flex-col items-center gap-1 py-2 px-1 rounded-xl border-0 transition-colors active:scale-[0.97] ${activeTab === "withdraw" ? "is-active" : ""}`}
            >
              <span className="grid h-10 w-10 place-items-center">
                <img src={withdrawNavIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
              </span>
              <span className="text-[9px] sm:text-[10px] font-sans font-black uppercase tracking-wide leading-none">Withdraw</span>
              
            </button>

            <button
              type="button"
              onClick={() => { setReferralView("overview"); setActiveTab("referral"); }}
              aria-current={activeTab === "referral" ? "page" : undefined}
              className={`user-app-nav-item flex flex-col items-center gap-1 py-2 px-1 rounded-xl border-0 transition-colors active:scale-[0.97] ${activeTab === "referral" ? "is-active" : ""}`}
            >
              <span className="grid place-items-center w-12 h-12">
                <img src={inviteNavIcon} alt="" aria-hidden="true" className="h-10 w-10 object-contain" />  
              </span>
              <span className="text-[9px] sm:text-[10px] font-sans font-black uppercase tracking-wide leading-none">Friends</span>
            
            </button>
          </nav>



      </div>
    </div>
      )}
    </ThemeProvider>
  );
}
