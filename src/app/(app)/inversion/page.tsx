"use client";

import { useState } from "react";
import { FondosTab } from "@/components/FondosTab";
import { InversionTab } from "@/components/InversionTab";

type Pestana = "FONDOS" | "INVERSION";

export default function InversionPage() {
  const [pestana, setPestana] = useState<Pestana>("FONDOS");

  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      <div className="flex gap-2">
        {(
          [
            { valor: "FONDOS", etiqueta: "Fondos" },
            { valor: "INVERSION", etiqueta: "Inversion" },
          ] as { valor: Pestana; etiqueta: string }[]
        ).map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => setPestana(p.valor)}
            className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
              pestana === p.valor ? "bg-ink text-white" : "bg-white text-ink/70 ring-1 ring-inset ring-sand"
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {pestana === "FONDOS" ? <FondosTab /> : <InversionTab />}
    </div>
  );
}
