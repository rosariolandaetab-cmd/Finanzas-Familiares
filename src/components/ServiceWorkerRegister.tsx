"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // instalacion de PWA es progresiva: si falla, la app sigue funcionando online
      });
    }
  }, []);

  return null;
}
