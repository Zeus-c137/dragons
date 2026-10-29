import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { Toaster } from 'sileo';
import App from './App.tsx';
import UpdateBanner from './components/UpdateBanner.tsx';
import './index.css';

// Older development builds registered a service worker that cached API
// responses. Remove it when running Vite dev so HMR and account data always
// come from the live server. Production builds use the generated worker.
if ((import.meta as any).env?.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  }).catch((error) => console.warn('[PWA] Could not unregister development worker:', error));
  if ('caches' in window) {
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.includes('api-runtime-cache')).map((key) => caches.delete(key))
    )).catch((error) => console.warn('[PWA] Could not clear stale API cache:', error));
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdateBanner />
    <Toaster
      position="top-center"
      options={{
        fill: "var(--theme-card-bg)",
        roundness: 16,
      }}
    />
  </StrictMode>,
);
