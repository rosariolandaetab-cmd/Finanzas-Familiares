"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

export function Login() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviarLink(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    setEnviando(false);
    if (error) {
      setError(`No se pudo enviar el link: ${error.message}`);
      return;
    }
    setEnviado(true);
  }

  if (enviado) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div>
          <p className="text-lg font-medium">Revisa tu correo</p>
          <p className="mt-2 text-taupe">
            Te enviamos un link a {email}. Ábrelo desde el teléfono para entrar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <form onSubmit={enviarLink} className="w-full max-w-sm space-y-4">
        <h1 className="text-center text-2xl font-semibold">Finanzas Familiares</h1>
        <p className="text-center text-sm text-taupe">Entra con tu correo para registrar movimientos</p>
        <input
          type="email"
          required
          autoFocus
          placeholder="tu@correo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-2xl border border-sand px-4 py-3 text-lg"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-2xl bg-clay py-3 text-lg font-medium text-white disabled:opacity-50"
        >
          {enviando ? "Enviando..." : "Enviarme un link para entrar"}
        </button>
      </form>
    </div>
  );
}
