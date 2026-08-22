"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { login, requestPasswordReset, confirmPasswordReset } from "@/lib/api";

const CARD = { background: "rgba(22,28,52,0.72)", borderColor: "rgba(255,255,255,0.10)" };
const FIELD = { background: "#141b31", border: "1px solid rgba(255,255,255,0.10)" };
const INPUT_CLS = "w-full rounded-lg px-3 py-2.5 text-sm text-stone-50 outline-none focus:ring-1 focus:ring-red-500/50 transition";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);
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

  if (forgot) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="w-full max-w-sm rounded-xl p-8 border" style={CARD}>
          <ForgotPassword initialEmail={email} onBack={() => setForgot(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-sm rounded-xl p-8 border" style={CARD}>
        {justRegistered && (
          <div className="text-sm text-emerald-400 bg-emerald-400/10 rounded-lg px-3 py-2 mb-5">
            Аккаунт создан! Теперь войдите.
          </div>
        )}
        <h1 className="text-3xl font-extrabold tracking-tight text-stone-50 mb-1">Вход</h1>
        <p className="text-sm text-stone-400 mb-6">
          Нет аккаунта?{" "}
          <Link href="/register" className="text-red-400 hover:underline">
            Зарегистрируйтесь
          </Link>
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-300 mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLS}
              style={FIELD}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-stone-300">Пароль</label>
              <button
                type="button"
                onClick={() => { setError(""); setForgot(true); }}
                className="text-xs text-red-400 hover:underline"
              >
                Забыли пароль?
              </button>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT_CLS}
              style={FIELD}
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
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-stone-50 bg-red-500 hover:bg-red-400 disabled:opacity-50 transition"
          >
            {loading ? "Входим..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}

// Two-step password reset: (1) email → code sent, (2) code + new password.
function ForgotPassword({ initialEmail, onBack }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState(initialEmail || "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const sendCode = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await requestPasswordReset(email);
      setInfo("Если такая почта зарегистрирована, мы отправили на неё код. Проверьте почту (и папку «Спам»).");
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await confirmPasswordReset(email, code, password);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-stone-50">Пароль изменён ✅</h1>
        <p className="text-sm text-stone-400">Теперь войдите с новым паролем.</p>
        <button
          onClick={onBack}
          className="w-full py-2.5 rounded-lg text-sm font-semibold text-stone-50 bg-red-500 hover:bg-red-400 transition"
        >
          Ко входу
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-stone-50 mb-1">Сброс пароля</h1>
      <p className="text-sm text-stone-400 mb-6">
        {step === 1
          ? "Введите почту от аккаунта — пришлём код для сброса."
          : "Введите код из письма и новый пароль."}
      </p>

      {info && (
        <div className="text-sm text-emerald-400 bg-emerald-400/10 rounded-lg px-3 py-2 mb-4">{info}</div>
      )}

      {step === 1 ? (
        <form onSubmit={sendCode} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-300 mb-1.5">Email</label>
            <input
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLS} style={FIELD} placeholder="you@example.com"
            />
          </div>
          {error && <div className="text-sm text-rose-500 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>}
          <button type="submit" disabled={busy}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-stone-50 bg-red-500 hover:bg-red-400 disabled:opacity-50 transition">
            {busy ? "Отправляем..." : "Отправить код"}
          </button>
        </form>
      ) : (
        <form onSubmit={confirm} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-300 mb-1.5">Код из письма</label>
            <input
              inputMode="numeric" required value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              maxLength={6}
              className={`${INPUT_CLS} tracking-[0.4em] text-center`} style={FIELD} placeholder="______"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-300 mb-1.5">Новый пароль</label>
            <input
              type="password" required value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT_CLS} style={FIELD} placeholder="Минимум 6 символов"
            />
          </div>
          {error && <div className="text-sm text-rose-500 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>}
          <button type="submit" disabled={busy}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-stone-50 bg-red-500 hover:bg-red-400 disabled:opacity-50 transition">
            {busy ? "Сохраняем..." : "Сменить пароль"}
          </button>
          <button type="button" onClick={() => { setError(""); setInfo(""); setStep(1); }}
            className="w-full text-xs text-stone-400 hover:text-stone-200 transition">
            Отправить код заново
          </button>
        </form>
      )}

      <button onClick={onBack} className="mt-5 w-full text-sm text-stone-400 hover:text-stone-200 transition">
        ← Назад ко входу
      </button>
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
