#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  WAW — установка всего стека на Ubuntu-сервере одной командой.
#  Ставит Docker (если нет), забирает проект, поднимает сайт.
#
#  Запуск:
#     bash setup.sh
# ─────────────────────────────────────────────────────────────
set -e

REPO="https://github.com/AndreyBorsh/MovieRating.git"
DIR="waw"

echo "==> 1/4  Проверяю Docker..."
if ! command -v docker >/dev/null 2>&1; then
  echo "    Docker не найден — устанавливаю..."
  curl -fsSL https://get.docker.com | sh
else
  echo "    Docker уже установлен."
fi

echo "==> 2/4  Забираю проект..."
if [ -d "$DIR/.git" ]; then
  echo "    Папка $DIR уже есть — обновляю (git pull)."
  cd "$DIR"
  git pull
else
  git clone "$REPO" "$DIR"
  cd "$DIR"
fi

echo "==> 3/4  Готовлю .env..."
if [ ! -f .env ]; then
  cp .env.example .env
  # генерирую случайный пароль для базы
  PASS="$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)"
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PASS}|" .env
  echo "    Создан .env, пароль базы сгенерирован автоматически."
else
  echo "    .env уже есть — не трогаю."
fi

echo "==> 4/4  Собираю и запускаю (это займёт несколько минут)..."
docker compose up -d --build

# открываю порт сайта, если включён ufw
if command -v ufw >/dev/null 2>&1; then
  ufw allow 3000 >/dev/null 2>&1 || sudo ufw allow 3000 >/dev/null 2>&1 || true
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo "═══════════════════════════════════════════════"
echo "  Готово! Сайт запущен."
echo "  Открой:  http://${IP:-IP-сервера}:3000"
echo ""
echo "  Полезное:"
echo "    docker compose ps          — статус"
echo "    docker compose logs -f     — логи"
echo "    docker compose up -d --build   — обновить после git pull"
echo "═══════════════════════════════════════════════"
