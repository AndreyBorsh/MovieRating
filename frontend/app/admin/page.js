"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  adminOverview, adminTables, adminTable, adminActivity, adminErrors, adminClearErrors,
} from "@/lib/api";

const TABS = [
  { key: "overview", label: "Обзор" },
  { key: "data", label: "Данные" },
  { key: "activity", label: "Активность" },
  { key: "errors", label: "Проблемы" },
];

const COUNT_LABELS = {
  users: "Пользователи",
  ratings: "Оценки",
  reviews: "Рецензии",
  movies: "Фильмы",
  tv_shows: "Сериалы",
  giveaways_open: "Розыгрышей открыто",
  giveaways_total: "Розыгрышей всего",
  entries: "Участий",
  pending_registrations: "Ждут подтв. почты",
  errors: "Ошибок в логе",
};

function fmt(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function AdminPage() {
  const { token, user, ready } = useAuth();
  const [tab, setTab] = useState("overview");

  if (!ready) return <div className="text-center text-stone-500 text-sm py-16">Загрузка...</div>;
  if (!user?.is_admin) {
    return <div className="text-center text-stone-500 text-sm py-16">Доступ только для администратора.</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-stone-900">🛠 Админка</h1>

      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: "#efe9df", border: "1px solid rgba(0,0,0,0.08)" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 sm:px-4 py-1.5 rounded-md text-sm font-medium transition ${
              tab === t.key ? "bg-amber-400 text-stone-900" : "text-stone-600 hover:text-stone-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview token={token} />}
      {tab === "data" && <DataBrowser token={token} />}
      {tab === "activity" && <Activity token={token} />}
      {tab === "errors" && <Errors token={token} />}
    </div>
  );
}

function Overview({ token }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { adminOverview(token).then(setData).catch((e) => setErr(e.message)); }, [token]);

  if (err) return <p className="text-rose-500 text-sm">{err}</p>;
  if (!data) return <p className="text-stone-500 text-sm">Загрузка...</p>;

  return (
    <div className="space-y-5">
      {data.flags?.length > 0 && (
        <div className="space-y-2">
          {data.flags.map((f, i) => (
            <div
              key={i}
              className="rounded-lg px-4 py-2.5 text-sm"
              style={{
                background: f.level === "error" ? "rgba(244,63,94,0.10)" : "rgba(245,196,81,0.16)",
                border: `1px solid ${f.level === "error" ? "rgba(244,63,94,0.30)" : "rgba(210,154,60,0.28)"}`,
              }}
            >
              {f.level === "error" ? "🔴" : "🟡"} <span className="text-stone-700">{f.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {Object.entries(data.counts).map(([k, v]) => (
          <div key={k} className="rounded-xl p-4 border" style={{ background: "rgba(255,255,255,0.72)", borderColor: "rgba(0,0,0,0.08)" }}>
            <div className="text-2xl font-extrabold text-stone-900">{v}</div>
            <div className="text-xs text-stone-500 mt-1">{COUNT_LABELS[k] || k}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataBrowser({ token }) {
  const [tables, setTables] = useState([]);
  const [active, setActive] = useState(null);
  const [tableData, setTableData] = useState(null);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState("");

  useEffect(() => { adminTables(token).then(setTables).catch((e) => setErr(e.message)); }, [token]);
  useEffect(() => {
    if (!active) return;
    setTableData(null);
    adminTable(token, active, offset).then(setTableData).catch((e) => setErr(e.message));
  }, [active, offset, token]);

  return (
    <div className="space-y-4">
      {err && <p className="text-rose-500 text-sm">{err}</p>}

      <div className="flex flex-wrap gap-2">
        {tables.map((t) => (
          <button
            key={t.name}
            onClick={() => { setActive(t.name); setOffset(0); }}
            className={`text-xs px-3 py-1.5 rounded-lg border transition ${
              active === t.name ? "border-amber-400/60 text-amber-600 bg-amber-400/10" : "border-stone-300 text-stone-600 hover:text-stone-900"
            }`}
          >
            {t.name} <span className="text-stone-400">({t.rows})</span>
          </button>
        ))}
      </div>

      {active && !tableData && <p className="text-stone-500 text-sm">Загрузка...</p>}

      {tableData && (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
            <table className="text-xs min-w-full">
              <thead>
                <tr className="bg-stone-100">
                  {tableData.columns.map((c) => (
                    <th key={c} className="text-left px-2 py-1.5 font-semibold text-stone-700 whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.rows.map((row, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                    {tableData.columns.map((c) => (
                      <td key={c} className="px-2 py-1.5 text-stone-700 align-top max-w-[280px] truncate" title={String(row[c] ?? "")}>
                        {String(row[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tableData.rows.length === 0 && <p className="text-stone-500 text-sm">Пусто.</p>}
          <div className="flex gap-2 items-center text-sm">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}
              className="px-3 py-1 rounded-lg border border-stone-300 text-stone-600 disabled:opacity-40">← Назад</button>
            <span className="text-stone-400 text-xs">строки {tableData.rows.length ? offset + 1 : 0}–{offset + tableData.rows.length}</span>
            <button disabled={tableData.rows.length < 50} onClick={() => setOffset(offset + 50)}
              className="px-3 py-1 rounded-lg border border-stone-300 text-stone-600 disabled:opacity-40">Вперёд →</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Activity({ token }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { adminActivity(token).then(setItems).catch((e) => setErr(e.message)); }, [token]);

  if (err) return <p className="text-rose-500 text-sm">{err}</p>;
  if (!items) return <p className="text-stone-500 text-sm">Загрузка...</p>;

  const icon = { user: "👤", rating: "⭐", claim: "🎟" };
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
      {items.length === 0 && <div className="px-4 py-3 text-stone-500 text-sm">Пока пусто.</div>}
      {items.map((e, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm border-t first:border-t-0" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          <span>{icon[e.type] || "•"}</span>
          <span className="text-stone-700 flex-1 min-w-0">{e.text}</span>
          <span className="text-xs text-stone-400 shrink-0">{fmt(e.at)}</span>
        </div>
      ))}
    </div>
  );
}

function Errors({ token }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState("");
  const load = () => adminErrors(token).then(setItems).catch((e) => setErr(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  const clear = async () => {
    if (!window.confirm("Очистить журнал ошибок?")) return;
    try { await adminClearErrors(token); load(); } catch (e) { setErr(e.message); }
  };

  if (err) return <p className="text-rose-500 text-sm">{err}</p>;
  if (!items) return <p className="text-stone-500 text-sm">Загрузка...</p>;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-stone-500">{items.length === 0 ? "Ошибок нет 🎉" : `Записей: ${items.length}`}</p>
        {items.length > 0 && (
          <button onClick={clear} className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:text-rose-500 hover:border-rose-400/50 transition">
            Очистить
          </button>
        )}
      </div>
      <div className="space-y-2">
        {items.map((e) => (
          <div key={e.id} className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.2)" }}>
            <div className="flex justify-between gap-3">
              <span className="font-mono text-xs text-rose-600 break-all">{e.context}</span>
              <span className="text-xs text-stone-400 shrink-0">{fmt(e.at)}</span>
            </div>
            <div className="text-stone-700 mt-1 break-words font-mono text-xs">{e.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
