# Публикация WAW в Google Play (TWA)

Приложение = «обёртка» (Trusted Web Activity) вокруг сайта https://makuku.ddns.net/waw-movie.
Оно запускает реальный сайт, поэтому **обновления сайта появляются в приложении сразу**, без
перевыпуска в Play. Только Android — Mac не нужен.

Сайт уже готов как PWA (манифест, иконки, service worker) — это сделано в коде.

---

## Шаг 1. Проверить, что PWA доступна на проде
После деплоя открой в браузере:
- https://makuku.ddns.net/waw-movie/manifest.webmanifest — должен отдаться JSON (не 404).
- В Chrome на телефоне: меню → «Установить приложение»/«На главный экран» должно предлагаться.

## Шаг 2. Сгенерировать Android-пакет через PWABuilder (без Android SDK)
1. Зайти на https://www.pwabuilder.com
2. Вставить URL: `https://makuku.ddns.net/waw-movie/`
3. Дождаться анализа → «Package for stores» → **Android** → «Generate Package».
4. Опции оставить по умолчанию (Package ID вида `net.ddns.makuku.waw` — запомни его).
5. Скачается zip. Внутри:
   - `*.aab` — файл для загрузки в Play.
   - ключ подписи (`signing.keystore` + пароли в `signing-key-info.txt`) — **СОХРАНИ НАВСЕГДА**,
     без него нельзя выпускать обновления.
   - `assetlinks.json` — уже с правильным отпечатком (SHA-256) твоего ключа.

## Шаг 3. Разместить assetlinks.json в КОРНЕ домена
Файл должен открываться строго по адресу (без /waw-movie):
`https://makuku.ddns.net/.well-known/assetlinks.json`

Это подтверждает связь приложения и сайта (иначе TWA покажет адресную строку).
Раздаёт его тот, кто фронтит домен makuku.ddns.net (reverse proxy / хостинг), т.к. сайт
живёт под /waw-movie, а этот файл нужен в корне. Содержимое — из zip PWABuilder (шаблон ниже,
`XX:XX...` заменить на реальный отпечаток из `assetlinks.json` от PWABuilder).

Проверка: открой ссылку выше в браузере — должен отдаться JSON.

## Шаг 4. Google Play Console
1. https://play.google.com/console — создать аккаунт разработчика (**$25 разово**, нужна карта и
   удостоверение). Это делаешь только ты.
2. Create app → название «What's Andrew Watching», язык русский, тип «App», бесплатное.
3. Загрузить `*.aab` в трек (можно начать с «Internal testing», потом «Production»).
4. Заполнить обязательное:
   - Store listing: краткое/полное описание, иконка 512×512, feature graphic 1024×500,
     минимум 2 скриншота телефона.
   - Content rating (анкета), Target audience, Data safety (какие данные собираешь: email),
     Privacy Policy URL (нужна страница политики — могу сделать `/waw-movie/privacy`).
5. Отправить на ревью. Обычно 1–7 дней.

---

## assetlinks.json (шаблон — отпечаток возьми из пакета PWABuilder)
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "net.ddns.makuku.waw",
    "sha256_cert_fingerprints": ["XX:XX:XX:...:XX"]
  }
}]
```

## Что могу подготовить я по запросу
- Тексты описания для стора (кратко/полно), список фич.
- Страницу Privacy Policy на сайте (`/waw-movie/privacy`) — Play её требует.
- Скриншоты (подсказать размеры / собрать из приложения).
- Feature graphic 1024×500 и финальную иконку 512×512.
- Подставить реальный `assetlinks.json`, когда будет отпечаток ключа.
