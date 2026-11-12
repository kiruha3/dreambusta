# Запуск и развёртывание DreamBusta

Рабочий каталог на этом компьютере: `E:\academy\sites\dreambusta`.
Приложение состоит из Vue/Vite, Node API с SQLite и локального Ollama для поиска
по смыслу и ответов помощника. Теххелпер для запуска не требуется.

## Короткие команды: npm и Makefile

Команды выполняются из корня проекта с Node 24+ в `PATH`. На Windows без `make`
используйте колонку npm. На Linux установите GNU Make (`sudo apt install make`
в Ubuntu/Debian) и используйте любую колонку.

Для сборки под `academy.dreamdocs.ru/library/`: `npm run build:library`
или `make build-library`. Полная инструкция для lore: [deploy-lore.md](deploy-lore.md).

| Make           | npm                        | Действие                                              |
| -------------- | -------------------------- | ----------------------------------------------------- |
| `make help`    | `npm run ops:help`         | Список команд                                         |
| `make install` | `npm ci`                   | Зависимости для разработки                            |
| `make dev`     | `npm run dev`              | API + Vite, остановка через Ctrl+C                    |
| `make doctor`  | `npm run doctor`           | Проверка локального интерфейса, API, поиска и моделей |
| `make check`   | `npm run check`            | Unit/HTTP, typecheck, сборка                          |
| `make verify`  | `npm run verify`           | check + браузерные E2E                                |
| `make release` | `npm run release`          | verify + архив релиза и файл SHA-256                  |
| `make pack`    | `npm run release:pack`     | Только упаковка уже проверенного dist/                |
| `make live`    | `npm run test:search:live` | Проверка настоящих моделей                            |

`make models` скачивает обе модели Ollama. `make test`, `make typecheck`,
`make build`, `make e2e`, `make api`, `make preview` запускают отдельные этапы.
Перед E2E один раз выполните `npx playwright install chromium`.
Проверка настоящей модели вынесена в `live`, поэтому обычный релиз не требует
Ollama. Любой неуспешный обязательный этап прерывает release до упаковки.
Команды не отправляют релиз на сервер и не заменяют библиотеку.

На Linux-сервере из `/opt/dreambusta/current` доступны отдельные команды
(запрашивают sudo, если запущены не root):

| Make                  | npm                      | Действие                                       |
| --------------------- | ------------------------ | ---------------------------------------------- |
| `make server-status`  | `npm run server:status`  | Состояние dreambusta.service                   |
| `make server-logs`    | `npm run server:logs`    | Последние 100 строк журнала                    |
| `make server-restart` | `npm run server:restart` | Перезапуск только DreamBusta                   |
| `make backup`         | `npm run backup`         | Копия /var/lib/dreambusta с остановкой сервиса |

Backup сохраняется в `/var/backups/dreambusta/` с SHA-256 и закрытыми правами.
Если сервис работал, он запускается снова и после успешного копирования, и при
ошибке архивации. Изначально остановленный сервис остаётся остановленным.
Эти команды применимы после установки unit по инструкции ниже. Сервер не требует
Vite: вместо `doctor` с dev-портами проверяйте HTTPS и API командами из диагностики.
Архив релиза содержит серверные файлы и команды обслуживания, но не полный
checkout для разработки: для `dev` нужны исходники проекта.

## Локальный запуск на Windows

Нужны Node.js **24+**, npm и установленные зависимости. В PowerShell:

```powershell
Set-Location E:\academy\sites\dreambusta
node --version
npm ci # при первом запуске или после изменения package-lock.json
npm run dev
```

Если системный Node старее 24, используйте Node из Codex:

```powershell
Set-Location E:\academy\sites\dreambusta
$taskNodeBin = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
$env:PATH = "$taskNodeBin;$env:PATH"
node --version
npm run dev
```

Терминал должен оставаться открытым. `Ctrl+C` останавливает API и Vite.
Для перезапуска остановите старый запуск и повторите `npm run dev`.

| Адрес                                 | Назначение                        |
| ------------------------------------- | --------------------------------- |
| http://localhost:5173/library         | Библиотека                        |
| http://localhost:5173/login           | Вход редактора                    |
| http://localhost:5176/api/session     | Проверка API                      |
| `http://<IP компьютера>:5173/library` | Проверка с телефона в той же сети |

Vite слушает `0.0.0.0:5173`, API по умолчанию — `0.0.0.0:5176`.
Для телефона нужен доступ Windows Firewall к 5173 в частной сети.
Первого редактора пустой библиотеки создают через `/login` на **localhost**;
для существующей библиотеки используют уже созданную учётку.

### Поиск и помощник

Запустите приложение Ollama либо в отдельном терминале:

```powershell
ollama serve
```

Если команда не найдена, обычный путь установки Windows:
`& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" serve`.
Если Ollama уже слушает 11434, второй экземпляр не нужен.
В другом терминале проверьте модели и при необходимости скачайте недостающие:

```powershell
ollama list
ollama pull embeddinggemma:latest
ollama pull gemma4:e2b
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```

На текущем компьютере обе модели уже скачаны. Ollama должен работать **на том же
компьютере**, что и API: приложение допускает только loopback HTTP-адрес модели.
Без Ollama остаётся поиск по словам, помощник сообщает о недоступности модели.
Векторы строятся в фоне и сохраняются в SQLite; готовый индекс переживает рестарт.

Переменные задаются **до запуска**. Файл `.env` автоматически не читается.
Обычно менять значения не нужно:

```powershell
$env:DREAMBUSTA_OLLAMA_URL = 'http://127.0.0.1:11434'
$env:DREAMBUSTA_EMBED_MODEL = 'embeddinggemma:latest'
$env:DREAMBUSTA_ANSWER_MODEL = 'gemma4:e2b'
# Для запуска без моделей: $env:DREAMBUSTA_AI = 'off'
```

### Проверка после запуска

```powershell
(Invoke-WebRequest http://localhost:5173/library).StatusCode
Invoke-RestMethod http://localhost:5173/api/session
Invoke-RestMethod 'http://localhost:5173/api/search?q=DreamDocs&limit=1'
```

Ожидаются HTTP 200, JSON сессии и результаты поиска. `mode: hybrid` означает
поиск со смысловым ранжированием; `lexical` — поиск по словам. `indexing: true`
означает, что векторный индекс ещё готовится. В пустой библиотеке результатов нет.
Откройте помощника и задайте вопрос, ответ на который есть в вашем материале;
проверьте переход по ссылке на источник. Общий вопрос без подтверждения может
дать близкие материалы без ответа — это ожидаемое поведение.

Занятый порт: проверьте владельца, прежде чем завершать процесс:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 5173,5176 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
Get-Process -Id <OwningProcess>
```

Другие порты задаются парой `WEB_PORT` и `API_PORT` перед `npm run dev`;
Vite proxy автоматически использует `API_PORT`.

## Сборка релиза

В каталоге исходников с Node 24+:

```powershell
npm ci
npm test
npm run typecheck
npm run build
npx playwright install chromium # один раз для браузерных проверок
npm run test:e2e
npm run test:search:live # отдельно: нужны запущенный Ollama и обе модели
```

При ошибке остановитесь и исправьте её до упаковки. E2E и live smoke используют
временные библиотеки. В релиз входят готовый `dist/` и серверные исходники:

```powershell
npm run release:pack
```

На Windows и Linux для упаковки нужен `tar` в PATH (Windows 10/11 включает его).
Архив и соседний `.sha256` создаются в игнорируемом `outputs/`. Упаковщик использует
явный список серверных файлов; `Makefile`, команды обслуживания и инструкция
также включены. Без `dist/index.html` упаковка завершается ошибкой.

Не включайте `data/`, `.env`, `.git`, `node_modules/` или сессии. Зависимости
устанавливаются на целевой ОС. Передайте архив и его SHA-256 оператору сервера;
сверьте хеш после передачи. Исходники находятся в отдельном Git-репозитории
`https://github.com/kiruha3/dreambusta.git`. Для установки через checkout на lore
используйте [инструкцию /library/](deploy-lore.md); доставка архивом остаётся
вариантом с отдельными каталогами релизов.

## Сервер Linux: первое развёртывание

Ниже — инструкция оператору; её наличие не означает, что сервер обновлён.
Схема и адрес существующего VPS описаны в
[deploy/dreambusta/README.md](../deploy/dreambusta/README.md).
Для существующей установки переходите к обновлению, не создавая библиотеку заново.

Нужны SSH/sudo, свободный локальный порт 5276, Nginx, Certbot, Python 3 и Node 24+.
Домены должны указывать на сервер, порты 80/443 — быть доступны для HTTPS/ACME.
Шаблоны в `deploy/dreambusta/` содержат текущий домен
`dreambusta.45-9-12-136.sslip.io`: для другого сервера замените его во **всех**
`server_name`, redirect и путях сертификата. Соседние сервисы не меняйте.

Команды далее выполняются в Bash на сервере. Установите отдельный официальный
Node 24 для архитектуры сервера в `/opt/dreambusta/runtime/`, проверьте скачанный
архив по официальному `SHASUMS256.txt` и направьте symlink `/opt/dreambusta/node`
на распакованный каталог. Дистрибутивы:
https://nodejs.org/dist/latest-v24.x/ . Не заменяйте системный Node соседних сервисов.

```sh
# Только при первой установке, если пользователь ещё не существует:
sudo useradd --system --user-group --home-dir /var/lib/dreambusta --shell /usr/sbin/nologin dreambusta
sudo install -d -m 755 /opt/dreambusta/releases /opt/dreambusta/runtime
sudo install -d -o dreambusta -g dreambusta -m 750 /var/lib/dreambusta
sudo install -d -m 755 /var/www/dreambusta-acme
/opt/dreambusta/node/bin/node --version
```

Распакуйте переданный архив в **новый** каталог релиза, затем установите зависимости:

```sh
set -e
release_id=$(date -u +%Y%m%dT%H%M%SZ)
release_dir="/opt/dreambusta/releases/$release_id"
test ! -e "$release_dir"
sudo mkdir "$release_dir"
# Подставьте путь к проверенному архиву:
sudo tar -xzf /tmp/dreambusta-release.tgz -C "$release_dir"
sudo env PATH=/opt/dreambusta/node/bin:/usr/bin:/bin sh -c \
  'cd "$1" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund' sh "$release_dir"
sudo chmod -R a+rX "$release_dir"
sudo ln -s "$release_dir" /opt/dreambusta/current.next
sudo mv -Tf /opt/dreambusta/current.next /opt/dreambusta/current
sudo install -m 644 /opt/dreambusta/current/deploy/dreambusta/dreambusta.service /etc/systemd/system/dreambusta.service
sudo systemctl daemon-reload
sudo systemctl enable --now dreambusta
curl --fail http://127.0.0.1:5276/api/session
```

Сервис слушает loopback:5276, хранит данные в `/var/lib/dreambusta`, запускается
пользователем `dreambusta`. При пустом хранилище создайте редактора **на сервере**
через loopback API. Пароль вводится скрыто; не вставляйте его в команды/файлы:

```sh
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

Если перенесена существующая библиотека с редактором, этот шаг пропустите.
После настройки входите через HTTPS `/login`.

### Nginx и HTTPS

1. Проверьте домен в `nginx-http.conf`. Установите его как отдельный vhost
   `/etc/nginx/sites-available/dreambusta`, включите symlink в `sites-enabled/`.
   Этот временный конфиг отдаёт ACME challenge и HTTP 503 остальным запросам.
2. Выполните `sudo nginx -t && sudo systemctl reload nginx`.
3. Выпустите сертификат для своего домена. Для текущего шаблона:

   ```sh
   sudo certbot certonly --webroot -w /var/www/dreambusta-acme \
     --cert-name dreambusta -d dreambusta.45-9-12-136.sslip.io
   ```

4. Установите проверенный `nginx.conf` вместо временного vhost. Проверьте домен,
   пути сертификата, `root /opt/dreambusta/current/dist` и proxy на 5276.
5. Снова выполните `sudo nginx -t && sudo systemctl reload nginx`.
   Настройте автоматическое продление сертификата и reload Nginx после него.

Готовый конфиг включает SPA fallback, заголовки proxy, лимит загрузки 1100m,
тайм-ауты и MIME для `.mjs` PDF worker. Корень сайта — только `dist/`;
`/var/lib/dreambusta` и серверные исходники не должны раздаваться как статика.

### Ollama на сервере

Установите Ollama по инструкции https://ollama.com/download/linux и запустите его
сервис на `127.0.0.1:11434`. Загрузите обе модели командой `ollama pull`, как в
локальном разделе. Не открывайте 11434 наружу. Модели Windows автоматически на
VPS не переносятся; серверу нужны собственные RAM/VRAM и место для моделей.

Настройки приложения задаются drop-in через `sudo systemctl edit dreambusta`:

```ini
[Service]
Environment=DREAMBUSTA_OLLAMA_URL=http://127.0.0.1:11434
Environment=DREAMBUSTA_EMBED_MODEL=embeddinggemma:latest
Environment=DREAMBUSTA_ANSWER_MODEL=gemma4:e2b
```

Затем `sudo systemctl daemon-reload && sudo systemctl restart dreambusta`.
Если ресурсы сервера пока не позволяют запустить модели, используйте
`Environment=DREAMBUSTA_AI=off`: каталог и поиск по словам будут работать.

## Обновление существующей установки

1. Сохраните текущую цель `readlink -f /opt/dreambusta/current`, конфиги и backup
   библиотеки по разделу ниже. Доставьте и проверьте новый архив релиза.
2. Повторите блок распаковки/установки зависимостей и переключения symlink из
   первого развёртывания **до строки установки systemd unit**. Не выполняйте
   `useradd`, первичную настройку и перенос локальной библиотеки.
3. Выполните `sudo systemctl restart dreambusta`. Уже установленный unit/drop-in
   сохраняется; его меняют отдельно только при необходимости.
4. Проверьте библиотеку, вход, чтение/скачивание файла, помощника и соседний WBook.
   При изменении только релиза reload Nginx не нужен.

Откат кода: направьте `current.next` на сохранённый каталог прежнего релиза,
переключите его через `mv -Tf` на `current` и перезапустите DreamBusta. Откат кода
не откатывает данные. Если изменился формат БД, нужна совместимая версия либо
восстановление согласованного backup; оно заменяет данные на состояние копии.

## Библиотека: резервирование и перенос

На Windows остановите приложение и скопируйте **весь** `data/`, включая SQLite,
WAL/SHM при их наличии, файлы, snapshots, covers и настройки доверенных источников.
Не копируйте только `library.sqlite` у работающего процесса. При обычном обновлении
кода библиотеку не заменяют. История браузера/позиции чтения в localStorage в
серверную копию не входит. Копия БД содержит пользователей и сессии — храните её
закрыто и передавайте отдельно от публичного релиза.

На Linux резервирование выполняют с остановкой только DreamBusta:

```sh
sudo bash <<'SH'
set -e
install -d -m 700 /var/backups/dreambusta
backup="/var/backups/dreambusta/library-$(date -u +%Y%m%dT%H%M%SZ).tgz"
systemctl stop dreambusta
trap 'systemctl start dreambusta' EXIT
umask 077
tar -czf "$backup" -C /var/lib/dreambusta .
sha256sum "$backup"
SH
```

Для первичного переноса распакуйте копию в пустое `/var/lib/dreambusta` при
остановленном сервисе, затем `sudo chown -R dreambusta:dreambusta /var/lib/dreambusta`
и запустите сервис. Для восстановления существующей установки сначала сохраните
текущий каталог отдельно; восстановите backup в новый пустой каталог и только
после проверки замените рабочий. Не накладывайте архив поверх живой библиотеки.
Локальная и серверная библиотеки после переноса независимы, синхронизации нет.

## Диагностика на сервере

```sh
sudo systemctl status dreambusta --no-pager
sudo journalctl -u dreambusta -n 100 --no-pager
curl --fail http://127.0.0.1:5276/api/session
curl --fail https://dreambusta.45-9-12-136.sslip.io/api/session
curl --fail 'https://dreambusta.45-9-12-136.sslip.io/api/search?q=DreamDocs&limit=1'
curl --fail http://127.0.0.1:11434/api/tags
sudo nginx -t
```

В закрытой библиотеке поиск без входа вернёт отказ — проверяйте через браузер
с сессией. HTTP 502: проверьте сервис и порт proxy; 413: активный Nginx vhost и
`client_max_body_size`; PDF worker: MIME `.mjs`; пустой помощник: Ollama/модели,
наличие извлечённого текста и область поиска. Сканы без OCR и медиа без
расшифровки не дают текста для ответов. API-ключи ТХ не требуются.
