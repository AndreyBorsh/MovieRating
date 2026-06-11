"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function Header() {
  const { token, user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const navLink = (href, label) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`text-sm font-medium transition-colors px-2 sm:px-3 py-1.5 rounded-md whitespace-nowrap ${
          active
            ? "text-amber-400 bg-amber-400/10"
            : "text-slate-400 hover:text-slate-100"
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
      className="sticky top-0 z-50 border-b"
      style={{ background: "#0c1220", borderColor: "#1e2d45" }}
    >
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-1.5 sm:gap-4">
        {/* Logo */}
        <Link
          href="/"
          className="text-base sm:text-lg font-bold tracking-tight text-amber-400 shrink-0"
        >
          <span className="hidden sm:inline">🎬 What's Andrew Watching</span>
          <span className="sm:hidden">🎬 WAW</span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-0.5 sm:gap-1 min-w-0">
          {navLink("/", "Главная")}
          {navLink("/search", "Поиск")}
          {token && navLink(`/profile/${user?.user_id}`, "Профиль")}
        </nav>

        {/* Auth */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {token ? (
            <>
              <span className="text-xs text-slate-500 hidden sm:block">
                {user?.username}
              </span>
              <button
                onClick={handleLogout}
                className="text-sm text-slate-400 hover:text-red-400 transition-colors px-2 sm:px-3 py-1.5 rounded-md whitespace-nowrap"
              >
                Выйти
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-slate-400 hover:text-slate-100 transition-colors px-2 sm:px-3 py-1.5 whitespace-nowrap"
              >
                Войти
              </Link>
              <Link
                href="/register"
                className="text-sm font-medium text-amber-400 border border-amber-400/40 hover:bg-amber-400/10 transition-colors px-2.5 sm:px-3 py-1.5 rounded-md whitespace-nowrap"
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
