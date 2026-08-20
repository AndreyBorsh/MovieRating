"use client";

import { useEffect } from "react";
import { BASE_PATH } from "@/lib/base";

// Registers the PWA service worker (scoped to the app's base path). Silent —
// failures are non-fatal (e.g. non-HTTPS dev).
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` })
      .catch(() => {});
  }, []);
  return null;
}
