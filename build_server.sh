#!/usr/bin/env bash
# Разворачивает/обновляет WAW. Запускать из каталога, где лежит server.tar.
# Распаковывает архив и пересобирает контейнеры так, чтобы новый код точно
# применился: старые контейнеры удаляются (кеш сборки не трогаем — он не мешает,
# а вот залипший старый контейнер продолжал бы крутить старый образ).
cd ..
tar -xvf server.tar -C .
chmod -R 777 waw
cd waw
docker compose stop frontend backend
docker compose rm -f frontend backend
docker compose up -d --build
