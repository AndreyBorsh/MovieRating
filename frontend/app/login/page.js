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
      authLogin(data.token, { user_id: data.user_id, username: data.username });
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
        style={{ background: "#141d2e", borderColor: "#1e2d45" }}
      >
        {justRegistered && (
          <div className="text-sm text-emerald-400 bg-emerald-400/10 rounded-lg px-3 py-2 mb-5">
            Аккаунт создан! Теперь войдите.
          </div>
        )}
        <h1 className="text-2xl font-bold text-slate-100 mb-1">Вход</h1>
        <p className="text-sm text-slate-500 mb-6">
          Нет аккаунта?{" "}
          <Link href="/register" className="text-amber-400 hover:underline">
            Зарегистрируйтесь
          </Link>
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-amber-400/50 transition"
              style={{ background: "#0c1220", border: "1px solid #1e2d45" }}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Пароль
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-amber-400/50 transition"
              style={{ background: "#0c1220", border: "1px solid #1e2d45" }}
              placeholder="••••••"
            />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition"
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
