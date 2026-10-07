"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

// Se entra con correo y contraseña. El link del correo se abre en el
// navegador, que guarda la sesion aparte de la app instalada en la pantalla de
// inicio, y por eso la app volvia a pedir el correo. El link queda solo como
// respaldo para quien todavia no crea su contraseña (se crea desde el menu).
export function Login() {
  const [modo, setModo] = useState<"CONTRASENA" | "LINK">("CONTRASENA");
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [linkEnviado, setLinkEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function entrarConContrasena(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: contrasena });
    setEnviando(false);
    if (error) {
      setError(
        "Correo o contraseña incorrectos. Si todavia no creas tu contraseña, entra con link al correo y creala desde el menu."
      );
    }
    // si sale bien, la sesion cambia y la app entra sola
  }

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
    setLinkEnviado(true);
  }

  if (linkEnviado) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <p className="text-lg font-medium">Revisa tu correo</p>
          <p className="text-sm text-taupe">
            Te enviamos un link a {email}. Al abrirlo entras desde el navegador. Una vez adentro, abre el menu y toca{" "}
            <span className="font-medium text-ink">Crear contraseña</span>: con ella entras desde la app de la pantalla
            de inicio y la sesion queda guardada.
          </p>
          <button
            type="button"
            onClick={() => {
              setLinkEnviado(false);
              setModo("CONTRASENA");
            }}
            className="text-sm text-taupe underline"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <form onSubmit={modo === "CONTRASENA" ? entrarConContrasena : enviarLink} className="w-full max-w-sm space-y-4">
        <h1 className="text-center text-2xl font-semibold">Finanzas Familiares</h1>
        <p className="text-center text-sm text-taupe">Entra con tu correo para registrar movimientos</p>
        <input
          type="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="tu@correo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-2xl border border-sand px-4 py-3 text-lg"
        />
        {modo === "CONTRASENA" && (
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="Contraseña"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            className="w-full rounded-2xl border border-sand px-4 py-3 text-lg"
          />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-2xl bg-clay py-3 text-lg font-medium text-white disabled:opacity-50"
        >
          {enviando ? "Un momento..." : modo === "CONTRASENA" ? "Entrar" : "Enviarme un link para entrar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setModo(modo === "CONTRASENA" ? "LINK" : "CONTRASENA");
            setError(null);
          }}
          className="w-full text-center text-sm text-taupe underline"
        >
          {modo === "CONTRASENA" ? "¿Aun no tienes contraseña? Entrar con link al correo" : "Entrar con contraseña"}
        </button>
      </form>
    </div>
  );
}
