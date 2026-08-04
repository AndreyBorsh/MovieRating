"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getNotifications, markNotificationsRead } from "@/lib/api";

function NotificationBell() {
  const { token } = useAuth();
  const router = useRouter();
  const [data, setData] = useState({ unread: 0, items: [], recipient_id: null });
  const [open, setOpen] = useState(false);

  const load = () => {
    if (!token) return;
    getNotifications(token).then((d) => setData(d || { unread: 0, items: [] })).catch(() => {});
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 45000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) return null;

  const toggle = async () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && data.unread > 0) {
      markNotificationsRead(token).catch(() => {});
      setData((d) => ({ ...d, unread: 0, items: d.items.map((i) => ({ ...i, is_read: true })) }));
    }
  };

  const GIVEAWAY_TYPES = ["giveaway", "manual_req", "manual_ok", "manual_no"];

  const go = (it) => {
    setOpen(false);
    if (GIVEAWAY_TYPES.includes(it.type)) { router.push("/giveaways"); return; }
    const base = it.media_type === "tv" ? `/tv/${it.media_id}` : `/movies/${it.media_id}`;
    router.push(`${base}#review-${data.recipient_id}`);
  };

  const itemText = (it) => {
    const where = it.title ? ` к «${it.title}»` : "";
    if (it.type === "giveaway")
      return `Поздравляем! Вы выиграли билет на «${it.actor_name}». Откройте «Розыгрыши» и нажмите «Получить приз», чтобы забрать его — билет придёт на почту, привязанную к аккаунту.`;
    if (it.type === "manual_req")
      return `🔎 ${it.actor_name} просит проверить рецензию вручную${where}. Откройте «Розыгрыши» и подтвердите или отклоните билетик.`;
    if (it.type === "manual_ok")
      return `✅ Ваша рецензия${where} прошла ручную проверку — билетик начислен!${it.detail ? ` Комментарий: ${it.detail}` : ""}`;
    if (it.type === "manual_no")
      return `❌ Ваша рецензия${where} не прошла ручную проверку — билетик не начислен.${it.detail ? ` Причина: ${it.detail}` : ""}`;
    if (it.type === "reaction") return `${it.actor_name} отреагировал(а) ${it.detail || ""} на вашу рецензию${where}`;
    return `${it.actor_name} прокомментировал(а) вашу рецензию${where}: ${it.detail || ""}`;
  };

  return (
    <div className="relative">
      <button
        onClick={toggle}
        aria-label="Уведомления"
        className="relative px-2 py-1.5 rounded-md text-stone-600 hover:text-stone-900 transition-colors flex items-center"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {data.unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 mt-2 w-80 max-w-[90vw] max-h-[70vh] overflow-y-auto rounded-2xl border z-50"
            style={{
              background: "rgba(255,255,255,0.85)",
              borderColor: "rgba(0,0,0,0.06)",
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
              boxShadow: "0 16px 40px rgba(40,30,15,0.14)",
            }}
          >
            <div className="px-4 py-2.5 border-b text-sm font-semibold text-stone-800" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
              Уведомления
            </div>
            {data.items.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-stone-500">Пока пусто</div>
            ) : (
              data.items.map((it) => (
                <button
                  key={it.id}
                  onClick={() => go(it)}
                  className="w-full text-left px-4 py-3 border-b hover:bg-black/5 transition-colors flex gap-2"
                  style={{ borderColor: "rgba(0,0,0,0.08)" }}
                >
                  <span className="text-base shrink-0">{
                    it.type === "reaction" ? "❤️"
                    : it.type === "giveaway" ? "🎉"
                    : it.type === "manual_req" ? "🔎"
                    : it.type === "manual_ok" ? "✅"
                    : it.type === "manual_no" ? "❌"
                    : "💬"
                  }</span>
                  <div className="min-w-0">
                    <p className="text-sm text-stone-700 leading-snug">{itemText(it)}</p>
                    {it.created_at && (
                      <p className="text-[11px] text-stone-400 mt-0.5">
                        {new Date(it.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function Header() {
  const { token, user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const navLink = (href, label) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`text-[13px] sm:text-sm font-medium transition-colors px-1.5 sm:px-3 py-1.5 rounded-md whitespace-nowrap ${
          active
            ? "text-amber-600 bg-amber-400/10"
            : "text-stone-600 hover:text-stone-900"
        }`}
      >
        {label}
      </Link>
    );
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: "rgba(250,247,241,0.72)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <div className="max-w-6xl mx-auto px-2 sm:px-6 h-14 flex items-center justify-between gap-0.5 sm:gap-4">
        {/* Logo */}
        <Link
          href="/"
          className="text-lg sm:text-xl font-extrabold tracking-tight text-amber-600 shrink-0"
        >
          <span className="hidden sm:inline">What's Andrew Watching</span>
          <span className="sm:hidden">WAW</span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-0 sm:gap-1 min-w-0">
          {navLink("/", "Главная")}
          {navLink("/search", "Поиск")}
          <Link
            href="/giveaways"
            className={`text-[13px] sm:text-sm font-medium transition-colors px-1.5 sm:px-3 py-1.5 rounded-md whitespace-nowrap ${
              pathname === "/giveaways" ? "text-amber-600 bg-amber-400/10" : "text-stone-600 hover:text-stone-900"
            }`}
            title="Розыгрыши"
          >
            <span className="hidden sm:inline">Розыгрыши</span>
            <span className="sm:hidden">🎟</span>
          </Link>
          {token && (
            <Link
              href={`/profile/${user?.user_id}`}
              className={`text-[13px] sm:text-sm font-medium transition-colors px-1.5 sm:px-3 py-1.5 rounded-md whitespace-nowrap ${
                pathname === `/profile/${user?.user_id}` ? "text-amber-600 bg-amber-400/10" : "text-stone-600 hover:text-stone-900"
              }`}
              title="Профиль"
            >
              <span className="hidden sm:inline">Профиль</span>
              <span className="sm:hidden">👤</span>
            </Link>
          )}
          {user?.is_admin && (
            <Link
              href="/admin"
              className={`text-[13px] sm:text-sm font-medium transition-colors px-1.5 sm:px-3 py-1.5 rounded-md whitespace-nowrap ${
                pathname === "/admin" ? "text-amber-600 bg-amber-400/10" : "text-stone-600 hover:text-stone-900"
              }`}
              title="Админка"
            >
              <span className="hidden sm:inline">🛠 Админ</span>
              <span className="sm:hidden">🛠</span>
            </Link>
          )}
        </nav>

        {/* Auth */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {token ? (
            <>
              <NotificationBell />
              <span className="text-xs text-stone-500 hidden sm:block">
                {user?.username}
              </span>
              <button
                onClick={handleLogout}
                className="text-sm text-stone-600 hover:text-rose-500 transition-colors px-2 sm:px-3 py-1.5 rounded-md whitespace-nowrap"
              >
                Выйти
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-stone-600 hover:text-stone-900 transition-colors px-2 sm:px-3 py-1.5 whitespace-nowrap"
              >
                Войти
              </Link>
              <Link
                href="/register"
                className="text-sm font-medium text-amber-600 border border-amber-400/40 hover:bg-amber-400/10 transition-colors px-2.5 sm:px-3 py-1.5 rounded-md whitespace-nowrap"
              >
                Регистрация
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
