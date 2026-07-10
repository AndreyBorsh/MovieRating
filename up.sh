#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  WAW — деплой/обновление с HTTPS (Caddy) одной командой.
#  ВСЕГДА пересобирает образы из текущих исходников (--build),
#  поэтому старый кеш (например фронт без basePath) не подхватится.
#
#  Запуск:   bash up.sh
# ─────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.https.yml"

# .env при первом запуске
if [ ! -f .env ]; then
  cp .env.example .env
  PASS="$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)"
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PASS}|" .env
  echo "==> Создан .env (случайный пароль БД). Проверь SITE_DOMAIN в .env при необходимости."
fi

echo "==> Пересобираю фронт и бэкенд из исходников (без кеша фронта)..."
$COMPOSE build --no-cache frontend
$COMPOSE build backend

echo "==> Запускаю весь стек..."
$COMPOSE up -d

DOMAIN="$(grep -E '^SITE_DOMAIN=' .env | cut -d= -f2)"
echo ""
echo "═══════════════════════════════════════════════"
echo "  Готово. Открой:  https://${DOMAIN:-<домен>}/waw-movie"
echo "  (в браузере нажми Ctrl+F5, чтобы сбросить кеш старой страницы)"
echo ""
echo "  Логи:    $COMPOSE logs -f"
echo "═══════════════════════════════════════════════"
