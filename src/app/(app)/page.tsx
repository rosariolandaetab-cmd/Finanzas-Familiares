"use client";

import { useAuth } from "@/context/AuthContext";
import { RegistrarForm } from "@/components/RegistrarForm";

export default function RegistrarPage() {
  const { persona } = useAuth();
  return <RegistrarForm persona={persona} />;
}
