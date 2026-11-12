# Развёртывание DreamBusta на lore

Временный адрес: `https://academy.dreamdocs.ru/library/`.
Будущий отдельный домен: `https://busta.dreamdocs.ru`.

Код — `/srv/sites/dreambusta`, данные — `/var/lib/dreambusta`, API —
`127.0.0.1:5276`, Ollama — `127.0.0.1:11434`. Академия продолжает работать на 8010.
Ниже команды для Bash на Debian 13, пользователь `helper` с sudo.
Это инструкция, а не отметка о выполненном развёртывании.

## 1. Отдельный Node 24

На lore обнаружен системный Node 20. Он не подходит для встроенного SQLite.
Устанавливаем отдельный runtime, не заменяя системный Node других сервисов.

```bash
sudo install -d -m 755 /opt/dreambusta/runtime
node_download=$(mktemp -d)
cd "$node_download"
curl -fsSLO https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt
node_archive=$(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ {print $2; exit}' SHASUMS256.txt)
test -n "$node_archive"
curl -fsSLO "https://nodejs.org/dist/latest-v24.x/$node_archive"
grep "  $node_archive\$" SHASUMS256.txt | sha256sum -c -
```

Продолжайте только при `OK` в проверке SHA-256:

```bash
sudo tar -xJf "$node_archive" -C /opt/dreambusta/runtime
sudo ln -sfnT "/opt/dreambusta/runtime/${node_archive%.tar.xz}" /opt/dreambusta/node
export PATH=/opt/dreambusta/node/bin:$PATH
node --version
npm --version
```

Ожидается Node `v24.*`. `curl`, `xz-utils`, Python 3 и Nginx должны быть установлены.

## 2. Сборка из Git

```bash
cd /srv/sites/dreambusta
git pull --ff-only
export PATH=/opt/dreambusta/node/bin:$PATH
npm ci
npm test
npm run typecheck
npm run build:library
```

Если команда завершается ошибкой, исправьте её до следующего шага.
Для полной браузерной проверки на Linux нужны Chromium и его системные зависимости:
`npx playwright install --with-deps chromium`, затем `npm run test:e2e`.
Установка этих зависимостей выполняется один раз.

Значение `/library` должно совпадать при сборке, в systemd и в Nginx.
Обычная сборка без переменной предназначена для отдельного домена.
Файл `.env` приложение автоматически не читает.

## 3. Пользователь и systemd

Для первой установки:

```bash
id dreambusta >/dev/null 2>&1 || sudo useradd --system --user-group --home-dir /var/lib/dreambusta --shell /usr/sbin/nologin dreambusta
sudo install -d -o dreambusta -g dreambusta -m 750 /var/lib/dreambusta
sudo ln -sfnT /srv/sites/dreambusta /opt/dreambusta/current
sudo install -m 644 deploy/dreambusta/dreambusta.service /etc/systemd/system/dreambusta.service
sudo install -d -m 755 /etc/systemd/system/dreambusta.service.d
sudo tee /etc/systemd/system/dreambusta.service.d/library.conf >/dev/null <<'CONF'
[Service]
Environment=DREAMBUSTA_BASE_PATH=/library
CONF
sudo systemctl daemon-reload
sudo systemctl enable --now dreambusta
curl --fail http://127.0.0.1:5276/api/session
```

`SECURE_COOKIE=1` в готовом unit требует входа по HTTPS.
API слушает только loopback; открывать 5276 в firewall не нужно.
При проблемах: `sudo journalctl -u dreambusta -n 100 --no-pager`.

## 4. Первый редактор

Git не содержит библиотеку, пользователей и файлы. После первого запуска она пустая.
Если уже перенесена существующая база, повторно создавать редактора не нужно.
Создание через публичный адрес заблокировано: выполните на lore через loopback:

```bash
python3 -c '
import getpass, json, urllib.request
email = input("Email редактора: ").strip()
password = getpass.getpass("Пароль (от 12 символов): ")
if password != getpass.getpass("Повторите пароль: "):
    raise SystemExit("Пароли различаются")
request = urllib.request.Request("http://127.0.0.1:5276/api/setup", data=json.dumps({"email": email, "password": password}).encode(), headers={"Content-Type": "application/json"})
with urllib.request.urlopen(request) as response:
    print("Редактор создан:", response.status)
'
```

## 5. Маршрут /library/ внутри Академии

Статика указывает только на собранный `dist/`, не на исходники или данные.

```bash
cd /srv/sites/dreambusta
sudo install -d -m 755 /var/www/dreambusta
sudo ln -sfnT /srv/sites/dreambusta/dist /var/www/dreambusta/library
sudo install -m 644 deploy/dreambusta/nginx-library.conf /etc/nginx/snippets/dreambusta-library.conf
sudo cp -a /etc/nginx/sites-enabled/academy.dreamdocs.ru.conf "/etc/nginx/academy-before-library-$(date -u +%Y%m%dT%H%M%SZ).conf"
sudo nano /etc/nginx/sites-enabled/academy.dreamdocs.ru.conf
```

В HTTPS-блок `server` с `listen 443 ssl` и `server_name academy.dreamdocs.ru`
добавьте **одну** строку, перед существующим `location /`:

```nginx
include /etc/nginx/snippets/dreambusta-library.conf;
```

Существующий proxy Академии на `127.0.0.1:8010` и сертификат сохраняются.
Применение:

```bash
sudo nginx -t && sudo systemctl reload nginx
curl --fail https://academy.dreamdocs.ru/library/api/session
curl --fail -I https://academy.dreamdocs.ru/library/
```

Вход: `https://academy.dreamdocs.ru/library/login`.
Проверьте, что сама `https://academy.dreamdocs.ru/` продолжает открывать Академию.
Nginx удаляет `/library` только при передаче API и embed-запросов в Node;
внешние адреса файлов, поиска, виджетов и cookie сохраняют этот префикс.

## 6. Ollama: один раз установить, дальше через админку

Установка официального Linux-сервиса требует sudo и выполняется один раз:

```bash
curl -fsSL https://ollama.com/install.sh -o /tmp/dreambusta-ollama-install.sh
sh /tmp/dreambusta-ollama-install.sh
sudo systemctl enable --now ollama
sudo install -d -m 755 /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/dreambusta.conf >/dev/null <<'CONF'
[Service]
Environment=OLLAMA_HOST=127.0.0.1:11434
Environment=OLLAMA_NUM_PARALLEL=1
Environment=OLLAMA_MAX_LOADED_MODELS=1
Environment=OLLAMA_KEEP_ALIVE=2m
CONF
sudo systemctl daemon-reload
sudo systemctl restart ollama
curl --fail http://127.0.0.1:11434/api/tags
```

Сервис автоматически стартует после перезагрузки. Порт 11434 наружу не открывать.
Выбор и загрузка моделей выполняются в кабинете редактора:
`https://academy.dreamdocs.ru/library/admin/ai` — «Локальные модели».
Здесь доступны статус службы, список моделей на диске и в памяти, загрузка с
прогрессом и отменой, выбор моделей для поиска/ответов и выгрузка из RAM.
Выбранные настройки сохраняются в базе и применяются без перезапуска приложения.
При смене модели поиска индекс перестраивается в фоне; поиск по словам остаётся.
Если в systemd явно задано `DREAMBUSTA_AI=off`, это запрет на уровне сервера:
удалите переменную и перезапустите DreamBusta, чтобы разрешить включение из админки.
Рекомендуемые начальные модели: `embeddinggemma:latest` для поиска и `gemma4:e2b`
для ответов. Подбирайте модель под свободную память; сервер общий с другими сервисами.
Без модели или при остановленной Ollama остаётся поиск по словам.

Ограничение одной загруженной модели уменьшает расход RAM, но переключение между
индексацией и ответами занимает дополнительное время. Для производительности
можно разрешить две модели после проверки нагрузки. Приложение запрашивает
освобождение памяти после двух минут простоя; следующий запрос загрузит модель снова.

## 7. Обновления, backup и перенос библиотеки

Перед обновлением сделайте backup, затем:

```bash
cd /srv/sites/dreambusta
export PATH=/opt/dreambusta/node/bin:$PATH
make backup
git pull --ff-only
npm ci
npm test
npm run typecheck
npm run build:library
sudo systemctl restart dreambusta
curl --fail https://academy.dreamdocs.ru/library/api/session
```

Backup создаётся в `/var/backups/dreambusta/` с SHA-256 и закрытыми правами.
Обновление из Git не должно заменять `/var/lib/dreambusta`.
Данная простая схема собирает статику непосредственно в рабочем checkout:
на время сборки интерфейс может быть недоступен. Для обновлений без такого окна
используйте каталоги релизов и переключение `current`, описанные в `operations.md`.

Для первоначального переноса локальной библиотеки передайте отдельный закрытый
архив **всего** `data/`, сделанный при остановленном локальном приложении.
Распакуйте в пустой `/var/lib/dreambusta` при остановленном сервисе, назначьте
владельца `dreambusta:dreambusta` и запустите сервис. Не накладывайте архив поверх
существующей рабочей базы. Архив содержит учётки и сессии, в Git его не добавлять.

## 8. Переезд на busta.dreamdocs.ru

После настройки DNS и HTTPS потребуется отдельный vhost из
`deploy/dreambusta/nginx.conf` с новым доменом и сертификатом. Соберите фронтенд
с пустым `DREAMBUSTA_BASE_PATH`, удалите эту переменную из drop-in и перезапустите
DreamBusta. Данные останутся в `/var/lib/dreambusta`. Старые публичные ссылки
под `/library/materials/` потребуют отдельного redirect при отключении маршрута
Академии; не удаляйте include до проверки нового домена.
