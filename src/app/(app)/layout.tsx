"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { Login } from "@/components/Login";
import { AppMenu } from "@/components/AppMenu";
import { AuthProvider } from "@/context/AuthContext";
import type { Persona } from "@/types/database";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [personaLista, setPersonaLista] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setPersona(null);
      setPersonaLista(true);
      return;
    }
    setPersonaLista(false);
    supabase
      .from("personas")
      .select("*")
      .eq("auth_uid", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setPersona(data ?? null);
        setPersonaLista(true);
      });
  }, [session]);

  if (session === undefined || !personaLista) {
    return <div className="flex min-h-dvh items-center justify-center text-taupe/70">Cargando...</div>;
  }

  if (!session) {
    return <Login />;
  }

  return (
    <AuthProvider value={{ session, persona }}>
      <div className="pb-20 pt-2">{children}</div>
      <AppMenu nombreUsuario={persona?.nombre ?? session.user.email ?? ""} />
    </AuthProvider>
  );
}
