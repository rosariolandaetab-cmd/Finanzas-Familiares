"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { Login } from "@/components/Login";
import { RegistrarForm } from "@/components/RegistrarForm";
import type { Persona } from "@/types/database";

export default function Home() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [persona, setPersona] = useState<Persona | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setPersona(null);
      return;
    }
    supabase
      .from("personas")
      .select("*")
      .eq("auth_uid", session.user.id)
      .maybeSingle()
      .then(({ data }) => setPersona(data ?? null));
  }, [session]);

  if (session === undefined) {
    return <div className="flex min-h-dvh items-center justify-center text-slate-400">Cargando...</div>;
  }

  if (!session) {
    return <Login />;
  }

  return (
    <main>
      <div className="mx-auto flex max-w-md items-center justify-between px-4 pt-4 text-sm text-slate-400">
        <span>{persona?.nombre ?? session.user.email}</span>
        <button onClick={() => supabase.auth.signOut()} className="underline">
          Salir
        </button>
      </div>
      <RegistrarForm persona={persona} />
    </main>
  );
}
