"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { tieneCuentasPersonales } from "@/lib/personal";

const ITEMS = [
  { href: "/", etiqueta: "Registrar" },
  { href: "/mes", etiqueta: "Mes" },
  { href: "/presupuesto", etiqueta: "Presupuesto" },
  { href: "/historial", etiqueta: "Historial" },
  { href: "/analisis", etiqueta: "Analisis" },
  { href: "/inversion", etiqueta: "Inversion" },
];

const ITEMS_PERSONALES = [
  { href: "/personal", etiqueta: "Registrar" },
  { href: "/personal/mes", etiqueta: "Mes" },
  { href: "/personal/historial", etiqueta: "Historial" },
];

function esActivo(href: string, pathname: string) {
  if (href === "/" || href === "/personal") return pathname === href;
  return pathname.startsWith(href);
}

export function AppMenu({ nombreUsuario }: { nombreUsuario: string }) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [conCuentasPersonales, setConCuentasPersonales] = useState(false);

  useEffect(() => {
    tieneCuentasPersonales().then(setConCuentasPersonales);
  }, []);

  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  const enPersonal = pathname.startsWith("/personal");

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir menu"
        className="fixed bottom-5 right-5 z-30 flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-full bg-ink text-white shadow-lg"
      >
        <span className="flex gap-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
        </span>
        <span className="flex gap-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
        </span>
      </button>

      {abierto && (
        <div className="fixed inset-0 z-40 flex flex-col bg-ink p-6">
          <div className="mx-auto flex w-full max-w-md items-center justify-between">
            <span className="text-lg font-semibold text-white">Finanzas Familiares</span>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar menu"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl text-ink"
            >
              ✕
            </button>
          </div>

          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 overflow-y-auto py-6">
            <SeccionMenu
              titulo={conCuentasPersonales ? "Familia" : null}
              items={ITEMS}
              pathname={enPersonal ? "" : pathname}
            />
            {conCuentasPersonales && (
              <SeccionMenu titulo={nombreUsuario} items={ITEMS_PERSONALES} pathname={enPersonal ? pathname : ""} />
            )}
          </div>

          <CrearContrasena />

          <div className="mx-auto flex w-full max-w-md items-center justify-between text-sm text-white/60">
            <span>{nombreUsuario}</span>
            <button
              type="button"
              onClick={() => {
                if (confirm("¿Cerrar sesion?")) supabase.auth.signOut();
              }}
              className="underline"
            >
              Salir
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function SeccionMenu({
  titulo,
  items,
  pathname,
}: {
  titulo: string | null;
  items: { href: string; etiqueta: string }[];
  pathname: string;
}) {
  return (
    <div>
      {titulo && <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">{titulo}</p>}
      <div className="grid grid-cols-3 gap-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex aspect-square flex-col items-center justify-center rounded-2xl text-center text-sm font-semibold ${
              esActivo(item.href, pathname) ? "bg-clay text-white" : "bg-white text-ink"
            }`}
          >
            {item.etiqueta}
          </Link>
        ))}
      </div>
    </div>
  );
}

// Con contraseña se entra desde la app de la pantalla de inicio y la sesion
// queda guardada ahi (el link del correo abre el navegador, que es aparte).
function CrearContrasena() {
  const [abierto, setAbierto] = useState(false);
  const [contrasena, setContrasena] = useState("");
  const [repetir, setRepetir] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function guardar() {
    if (contrasena.length < 6) return setMensaje("Debe tener al menos 6 caracteres.");
    if (contrasena !== repetir) return setMensaje("Las dos contraseñas no coinciden.");
    setGuardando(true);
    const { error } = await supabase.auth.updateUser({ password: contrasena });
    setGuardando(false);
    if (error) return setMensaje(`No se pudo guardar: ${error.message}`);
    setMensaje("Contraseña guardada ✓ Ya puedes entrar con ella desde la app.");
    setContrasena("");
    setRepetir("");
  }

  if (!abierto) {
    return (
      <div className="mx-auto mb-3 w-full max-w-md text-sm">
        <button type="button" onClick={() => setAbierto(true)} className="text-white/60 underline">
          Crear o cambiar contraseña
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-3 w-full max-w-md space-y-2 rounded-2xl bg-white/10 p-3 text-sm">
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Nueva contraseña"
        value={contrasena}
        onChange={(e) => setContrasena(e.target.value)}
        className="w-full rounded-xl px-3 py-2 text-ink"
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Repetir contraseña"
        value={repetir}
        onChange={(e) => setRepetir(e.target.value)}
        className="w-full rounded-xl px-3 py-2 text-ink"
      />
      {mensaje && <p className="text-white/80">{mensaje}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="flex-1 rounded-xl bg-clay py-2 font-medium text-white disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Guardar contraseña"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setMensaje(null);
          }}
          className="rounded-xl bg-white/20 px-3 py-2 text-white"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
