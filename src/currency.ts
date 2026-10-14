import { useState, useEffect } from 'react';

type Currency = "UGX" | "USD";
export type CurrencyPreference = "default" | "USD";

export const EXCHANGE_RATE = 3700; // 1 USD = 3700 UGX
const CURRENCY_PREFERENCE_KEY = "user_currency_preference";

// Keep state minimal: currency is always UGX for this app
let cachedCurrency: Currency = "UGX";
let currencyPreference: CurrencyPreference = "default";

const listeners: Array<(currency: Currency) => void> = [];
const preferenceListeners: Array<(preference: CurrencyPreference) => void> = [];

function setGlobalCurrency(val: Currency) {
  cachedCurrency = val;
  listeners.forEach(l => l(val));
}

// Remove old persisted user currency and ignore any stored USD preference
if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem("user_currency");
    const stored = window.localStorage.getItem(CURRENCY_PREFERENCE_KEY);
    if (stored === "USD") {
      window.localStorage.removeItem(CURRENCY_PREFERENCE_KEY);
    }
  } catch {
    // ignore
  }
}

async function detectCurrency(): Promise<Currency> {
  // Disabled IP-based detection: always UGX
  setGlobalCurrency("UGX");
  return "UGX";
}

export function setCurrencyPreference(_preference: CurrencyPreference) {
  // Prevent switching to USD — always enforce UGX/default
  currencyPreference = "default";
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(CURRENCY_PREFERENCE_KEY);
  } catch {}

  preferenceListeners.forEach(listener => listener(currencyPreference));
  setGlobalCurrency("UGX");
}

export function useCurrency() {
  const [currency, setCurrency] = useState<Currency>(cachedCurrency);
  const [preference, setPreference] = useState<CurrencyPreference>(currencyPreference);

  useEffect(() => {
    const handleUpdate = (newVal: Currency) => setCurrency(newVal);
    const handlePref = (p: CurrencyPreference) => setPreference(p);
    listeners.push(handleUpdate);
    preferenceListeners.push(handlePref);

    // Ensure UGX on mount
    void detectCurrency();

    return () => {
      const i = listeners.indexOf(handleUpdate);
      if (i > -1) listeners.splice(i, 1);
      const j = preferenceListeners.indexOf(handlePref);
      if (j > -1) preferenceListeners.splice(j, 1);
    };
  }, []);

  const formatCurrency = (amountUgx: number) => {
    const numericAmount = Number(amountUgx);
    const wholeAmount = Number.isFinite(numericAmount) ? Math.trunc(numericAmount) : 0;
    return `UGX ${wholeAmount.toLocaleString("en-UG", { maximumFractionDigits: 0 })}`;
  };

  return { currency, preference, setCurrencyPreference, formatCurrency, EXCHANGE_RATE };
}
