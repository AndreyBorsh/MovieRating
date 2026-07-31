"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { login } from "@/lib/api";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";

  const { login: authLogin } = useAuth();
  const router = useRouter();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await login(email, password);
      authLogin(data.token, { user_id: data.user_id, username: data.username, is_admin: data.is_admin });
      router.push("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div
        className="w-full max-w-sm rounded-xl p-8 border"
        style={{ background: "rgba(255,255,255,0.72)", borderColor: "rgba(0,0,0,0.08)" }}
      >
        {justRegistered && (
          <div className="text-sm text-emerald-600 bg-emerald-400/10 rounded-lg px-3 py-2 mb-5">
            Аккаунт создан! Теперь войдите.
          </div>
        )}
        <h1 className="text-3xl font-extrabold tracking-tight text-stone-900 mb-1">Вход</h1>
        <p className="text-sm text-stone-500 mb-6">
          Нет аккаунта?{" "}
          <Link href="/register" className="text-amber-600 hover:underline">
            Зарегистрируйтесь
          </Link>
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-sm text-stone-900 outline-none focus:ring-1 focus:ring-amber-400/50 transition"
              style={{ background: "#efe9df", border: "1px solid rgba(0,0,0,0.08)" }}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">
              Пароль
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-sm text-stone-900 outline-none focus:ring-1 focus:ring-amber-400/50 transition"
              style={{ background: "#efe9df", border: "1px solid rgba(0,0,0,0.08)" }}
              placeholder="••••••"
            />
          </div>

          {error && (
            <div className="text-sm text-rose-500 bg-red-400/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-stone-900 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition"
          >
            {loading ? "Входим..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
