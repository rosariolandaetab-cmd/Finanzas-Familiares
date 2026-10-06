"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

// Entrar con el codigo del correo (no con el link): el link se abre en el
// navegador, que guarda la sesion aparte de la app instalada en la pantalla de
// inicio, y por eso la app volvia a pedir el correo. Escribiendo el codigo
// aqui mismo, la sesion queda guardada en la app.
export function Login() {
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    setEnviando(false);
    if (error) {
      setError(`No se pudo enviar el correo: ${error.message}`);
      return;
    }
    setEnviado(true);
  }

  async function verificarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setVerificando(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo, type: "email" });
    setVerificando(false);
    if (error) setError("El codigo no es valido o ya vencio. Revisa el ultimo correo o pide uno nuevo.");
    // si sale bien, la sesion cambia y la app entra sola
  }

  if (enviado) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <form onSubmit={verificarCodigo} className="w-full max-w-sm space-y-4 text-center">
          <p className="text-lg font-medium">Revisa tu correo</p>
          <p className="text-sm text-taupe">
            Te enviamos un codigo a {email}. Escribelo aqui, sin salir de la app, para que la sesion quede guardada.
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="Codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 10))}
            className="w-full rounded-2xl border border-sand px-4 py-3 text-center text-2xl tracking-widest"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={verificando || codigo.length < 6}
            className="w-full rounded-2xl bg-clay py-3 text-lg font-medium text-white disabled:opacity-50"
          >
            {verificando ? "Entrando..." : "Entrar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEnviado(false);
              setCodigo("");
              setError(null);
            }}
            className="text-sm text-taupe underline"
          >
            Cambiar correo o pedir otro codigo
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <form onSubmit={enviarCodigo} className="w-full max-w-sm space-y-4">
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
          {enviando ? "Enviando..." : "Enviarme un codigo para entrar"}
        </button>
      </form>
    </div>
  );
}
