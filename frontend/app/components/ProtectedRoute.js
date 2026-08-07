"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ProtectedRoute({ children }) {
  const { token, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !token) {
      router.push("/login");
    }
  }, [token, ready, router]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-stone-400 text-sm">Загрузка...</div>
      </div>
    );
  }

  return token ? children : null;
}
