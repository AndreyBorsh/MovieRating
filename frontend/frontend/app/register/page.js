"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form.username, form.email, form.password);
      router.push("/login");
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
        <h1 className="text-2xl font-bold text-slate-100 mb-1">Регистрация</h1>
        <p className="text-sm text-slate-500 mb-6">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="text-amber-400 hover:underline">
            Войдите
          </Link>
        </p>

        <form onSubmit={submit} className="space-y-4">
          {[
            { field: "username", label: "Имя пользователя", type: "text", placeholder: "cinephile42" },
            { field: "email", label: "Email", type: "email", placeholder: "you@example.com" },
            { field: "password", label: "Пароль", type: "password", placeholder: "Минимум 6 символов" },
          ].map(({ field, label, type, placeholder }) => (
            <div key={field}>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                {label}
              </label>
              <input
                type={type}
                required
                value={form[field]}
                onChange={update(field)}
                className="w-full rounded-lg px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-amber-400/50 transition"
                style={{ background: "#0c1220", border: "1px solid #1e2d45" }}
                placeholder={placeholder}
              />
            </div>
          ))}

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
            {loading ? "Создаём аккаунт..." : "Зарегистрироваться"}
          </button>
        </form>
      </div>
    </div>
  );
}
