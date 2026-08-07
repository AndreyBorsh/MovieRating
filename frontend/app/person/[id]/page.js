"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getPerson } from "@/lib/api";
import { img } from "@/lib/base";
import ExpandableText from "@/app/components/ExpandableText";

const PHOTO = (p) => img("w342", p);
const POSTER = (p) => img("w342", p);

const DEPT = {
  Acting: "Актёр",
  Directing: "Режиссёр",
  Writing: "Сценарист",
  Production: "Продюсер",
  Camera: "Оператор",
  Sound: "Звук",
};

function yearsWord(n) {
  const a = n % 100;
  if (a >= 11 && a <= 14) return "лет";
  const b = n % 10;
  if (b === 1) return "год";
  if (b >= 2 && b <= 4) return "года";
  return "лет";
}

function ageBetween(birthday, end) {
  if (!birthday) return null;
  const b = new Date(birthday);
  const e = end ? new Date(end) : new Date();
  let age = e.getFullYear() - b.getFullYear();
  const m = e.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && e.getDate() < b.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

function fmtDate(s) {
  if (!s) return null;
  try {
    return new Date(s).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return s;
  }
}

export default function PersonPage() {
  const { id } = useParams();
  const [person, setPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("new");
  const [q, setQ] = useState("");

  useEffect(() => {
    setLoading(true);
    getPerson(id)
      .then((p) => setPerson(p && p.id ? p : null))
      .catch(() => setPerson(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="text-center text-stone-400 text-sm py-16">Загрузка...</div>;
  }
  if (!person) {
    return <div className="text-center text-stone-400 text-sm py-16">Не удалось загрузить информацию об актёре.</div>;
  }

  const dept = DEPT[person.known_for] || person.known_for;

  const query = q.trim().toLowerCase();
  const films = (person.filmography || [])
    .filter((f) => !query || (f.title || "").toLowerCase().includes(query))
    .slice()
    .sort((a, b) => {
      if (sort === "popular") return (b.popularity || 0) - (a.popularity || 0);
      if (sort === "title") return (a.title || "").localeCompare(b.title || "", "ru");
      const da = a.date || "", db = b.date || "";
      // undated always last, regardless of direction
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return sort === "old" ? da.localeCompare(db) : db.localeCompare(da);
    });
  const liveAge = ageBetween(person.birthday, null);
  const deathAge = ageBetween(person.birthday, person.deathday);

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row gap-5">
        {PHOTO(person.photo) ? (
          <img
            src={PHOTO(person.photo)}
            alt={person.name}
            className="w-40 sm:w-48 rounded-2xl object-cover shrink-0 self-start shadow-lg"
          />
        ) : (
          <div className="w-40 sm:w-48 h-56 sm:h-72 rounded-2xl bg-stone-700 flex items-center justify-center text-6xl text-stone-500 shrink-0 self-start">
            👤
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-stone-50 leading-tight">
            {person.name}
          </h1>
          {dept && <div className="text-red-500 font-medium mt-1">{dept}</div>}

          <div className="mt-3 space-y-1 text-sm text-stone-300">
            {person.birthday && (
              <div>
                🎂 {fmtDate(person.birthday)}
                {!person.deathday && liveAge != null && ` · ${liveAge} ${yearsWord(liveAge)}`}
              </div>
            )}
            {person.deathday && (
              <div>
                🕯 {fmtDate(person.deathday)}
                {deathAge != null && ` · прожил ${deathAge} ${yearsWord(deathAge)}`}
              </div>
            )}
            {person.place_of_birth && <div>📍 {person.place_of_birth}</div>}
          </div>

          {person.biography && (
            <ExpandableText
              text={person.biography}
              className="text-sm text-stone-200 leading-relaxed whitespace-pre-line"
              clampClass="line-clamp-5"
            />
          )}
        </div>
      </div>

      {/* ── Filmography ── */}
      {person.filmography?.length > 0 && (
        <section>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-stone-50">
              Фильмография <span className="text-stone-500 font-semibold text-base">{person.filmography.length}</span>
            </h2>
            <div className="flex items-center gap-2 ml-auto">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Поиск по проектам…"
                className="rounded-lg px-3 py-1.5 text-sm text-stone-50 outline-none focus:ring-1 focus:ring-red-500/50 w-40 sm:w-56"
                style={{ background: "rgba(22,28,52,0.72)", border: "1px solid rgba(255,255,255,0.12)" }}
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="rounded-lg px-2 py-1.5 text-sm text-stone-50 outline-none cursor-pointer"
                style={{ background: "#0f1526", border: "1px solid rgba(255,255,255,0.14)" }}
              >
                <option value="new">Сначала новые</option>
                <option value="old">Сначала старые</option>
                <option value="popular">По популярности</option>
                <option value="title">По названию</option>
              </select>
            </div>
          </div>
          {films.length === 0 ? (
            <p className="text-sm text-stone-400 py-6">Ничего не найдено по запросу «{q.trim()}».</p>
          ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {films.map((f) => (
              <Link
                key={`${f.media_type}-${f.id}`}
                href={`/${f.media_type === "tv" ? "tv" : "movies"}/${f.id}`}
                className="group"
              >
                <div className="rounded-xl overflow-hidden bg-stone-800 aspect-[2/3] mb-1.5 border border-transparent group-hover:border-red-500/40 transition-all">
                  {POSTER(f.poster) ? (
                    <img
                      src={POSTER(f.poster)}
                      alt={f.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl text-stone-600">
                      {f.media_type === "tv" ? "📺" : "🎬"}
                    </div>
                  )}
                </div>
                <p className="text-xs font-medium text-stone-100 leading-tight line-clamp-2 group-hover:text-red-400 transition-colors">
                  {f.title}
                </p>
                <p className="text-[10px] text-stone-400 leading-tight line-clamp-1 mt-0.5">
                  {f.year || ""}
                  {f.character ? `${f.year ? " · " : ""}${f.character}` : ""}
                </p>
              </Link>
            ))}
          </div>
          )}
        </section>
      )}
    </div>
  );
}
