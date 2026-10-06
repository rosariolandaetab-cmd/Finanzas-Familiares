"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { RegistrarForm } from "@/components/RegistrarForm";
import { SelectorLibro } from "@/components/SelectorLibro";
import { leerRegistrarPreferido, tieneCuentasPersonales } from "@/lib/personal";

export default function RegistrarPage() {
  const { persona } = useAuth();
  const router = useRouter();
  const [listo, setListo] = useState(false);

  useEffect(() => {
    // quien tiene cuentas personales vuelve a donde anoto la ultima vez
    if (leerRegistrarPreferido() !== "personal") {
      setListo(true);
      return;
    }
    tieneCuentasPersonales().then((tiene) => {
      if (tiene) router.replace("/personal");
      else setListo(true);
    });
  }, [router]);

  if (!listo) return null;

  return (
    <>
      <SelectorLibro actual="familia" nombre={persona?.nombre ?? ""} />
      <RegistrarForm persona={persona} />
    </>
  );
}
