"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register, verifyEmail } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState("form"); // "form" | "verify"
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [devCode, setDevCode] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const codeRefs = useRef([]);

  useEffect(() => {
    if (step === "verify") codeRefs.current[0]?.focus();
  }, [step]);

  const update = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const submitForm = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await register(form.username, form.email, form.password);
      if (res.code) setDevCode(res.code);
      setStep("verify");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onCodeInput = (i, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[i] = digit;
    setCode(next);
    if (digit && i < 5) codeRefs.current[i + 1]?.focus();
  };

  const onCodeKey = (i, e) => {
    if (e.key === "Backspace" && !code[i] && i > 0) {
      codeRefs.current[i - 1]?.focus();
    }
  };

  const onCodePaste = (e) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = [...code];
    text.split("").forEach((ch, i) => { next[i] = ch; });
    setCode(next);
    codeRefs.current[Math.min(text.length, 5)]?.focus();
  };

  const submitCode = async (e) => {
    e.preventDefault();
    const fullCode = code.join("");
    if (fullCode.length < 6) { setError("Введите все 6 цифр"); return; }
    setError("");
    setLoading(true);
    try {
      await verifyEmail(form.email, fullCode);
      router.push("/login?registered=1");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full rounded-lg px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-amber-400/50 transition";
  const inputStyle = { background: "#0c1220", border: "1px solid #1e2d45" };

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div
        className="w-full max-w-sm rounded-xl p-8 border"
        style={{ background: "#141d2e", borderColor: "#1e2d45" }}
      >
        {step === "form" ? (
          <>
            <h1 className="text-2xl font-bold text-slate-100 mb-1">Регистрация</h1>
            <p className="text-sm text-slate-500 mb-6">
              Уже есть аккаунт?{" "}
              <Link href="/login" className="text-amber-400 hover:underline">
                Войдите
              </Link>
            </p>

            <form onSubmit={submitForm} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Имя пользователя
                </label>
                <input
                  type="text"
                  required
                  value={form.username}
                  onChange={update("username")}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="cinephile42"
                  minLength={2}
                  maxLength={30}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={update("email")}
                  className={inputClass}
                  style={inputStyle}
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
                  value={form.password}
                  onChange={update("password")}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="Минимум 6 символов"
                  minLength={6}
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
                {loading ? "Отправляем код..." : "Продолжить"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-100 mb-1">Подтверждение</h1>
            <p className="text-sm text-slate-500 mb-4">
              Отправили 6-значный код на{" "}
              <span className="text-amber-400">{form.email}</span>
            </p>
            {devCode && (
              <div className="rounded-lg px-4 py-3 mb-2 text-center"
                   style={{ background: "#0c1220", border: "1px solid #2a3a55" }}>
                <span className="text-xs text-slate-500 block mb-1">Ваш код подтверждения</span>
                <span className="text-amber-400 font-bold tracking-[0.3em] text-2xl">{devCode}</span>
              </div>
            )}

            <form onSubmit={submitCode} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-3">
                  Введите код из письма
                </label>
                <div className="flex gap-2 justify-between" onPaste={onCodePaste}>
                  {code.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => (codeRefs.current[i] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => onCodeInput(i, e.target.value)}
                      onKeyDown={(e) => onCodeKey(i, e)}
                      className="w-10 h-12 rounded-lg text-center text-lg font-bold text-slate-100 outline-none focus:ring-2 focus:ring-amber-400/60 transition"
                      style={{ background: "#0c1220", border: `1px solid ${digit ? "#b8860b" : "#1e2d45"}` }}
                    />
                  ))}
                </div>
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
                {loading ? "Проверяем..." : "Подтвердить"}
              </button>

              <button
                type="button"
                onClick={() => { setStep("form"); setCode(["","","","","",""]); setError(""); }}
                className="w-full text-xs text-slate-500 hover:text-slate-300 transition"
              >
                ← Изменить email
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
