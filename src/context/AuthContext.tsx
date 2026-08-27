"use client";

import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Persona } from "@/types/database";

export type AuthData = {
  session: Session;
  persona: Persona | null;
};

const AuthContext = createContext<AuthData | null>(null);

export function AuthProvider({ value, children }: { value: AuthData; children: React.ReactNode }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthData {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return ctx;
}
