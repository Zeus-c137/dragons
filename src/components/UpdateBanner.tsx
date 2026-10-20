import { useEffect, useRef } from "react";
import { useGatedInterval } from "../hooks/useGatedInterval";
import { registerSW } from "virtual:pwa-register";

const UPDATE_CHECK_MS = 30 * 60 * 1000;
const RELOAD_FALLBACK_MS = 10000;

// Updates download in the background and are applied when the player leaves
// the app. This avoids interrupting a hatch, claim, or money action with a
// prompt or an unexpected reload.
export default function UpdateBanner() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const applyUpdateRef = useRef<(() => Promise<void>) | null>(null);
  const updateWaitingRef = useRef(false);
  const applyingRef = useRef(false);
  const reloadOnNextHideRef = useRef(false);
  const fallbackTimerRef = useRef<number | null>(null);

  useGatedInterval(() => {
    if (!document.hidden) registrationRef.current?.update().catch(() => {});
  }, UPDATE_CHECK_MS, { enabled: true, visibilityGate: true });

  useEffect(() => {
    if ((import.meta as any).env?.DEV || !("serviceWorker" in navigator)) return;

    const applyWhenHidden = () => {
      if (!document.hidden) return;

      if (reloadOnNextHideRef.current) {
        window.location.reload();
        return;
      }

      if (!updateWaitingRef.current || !applyUpdateRef.current || applyingRef.current) return;
      updateWaitingRef.current = false;
      applyingRef.current = true;
      void applyUpdateRef.current().catch(() => {
        applyingRef.current = false;
        updateWaitingRef.current = true;
      });
      fallbackTimerRef.current = window.setTimeout(() => {
        if (applyingRef.current && document.hidden) window.location.reload();
      }, RELOAD_FALLBACK_MS);
    };

    const checkForUpdate = () => {
      if (!document.hidden) {
        navigator.serviceWorker.getRegistration()
          .then((registration) => registration?.update().catch(() => {}))
          .catch(() => {});
        return;
      }
      applyWhenHidden();
    };

    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        updateWaitingRef.current = true;
        applyWhenHidden();
      },
      onNeedReload() {
        if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current);
        applyingRef.current = false;
        if (document.hidden) window.location.reload();
        else reloadOnNextHideRef.current = true;
      },
      onRegisteredSW(_url, registration) {
        if (!registration) return;
        registrationRef.current = registration;
        applyUpdateRef.current = update;
        applyWhenHidden();
      },
    });
    applyUpdateRef.current = update;

    document.addEventListener("visibilitychange", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);
    return () => {
      document.removeEventListener("visibilitychange", checkForUpdate);
      window.removeEventListener("focus", checkForUpdate);
      if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current);
    };
  }, []);

  return null;
}
