# DreamBusta Vue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собрать локально работающую библиотеку по согласованным макетам: каталог, подборки, загрузка/ссылки, просмотр и чтение, управление.

**Architecture:** Vue 3 SPA и отдельный Node HTTP API; SQLite и файлы в игнорируемом data/. WBook импортёры и алгоритмы остаются общими TypeScript-модулями; UI переводится на Vue. Источники имеют отдельные адаптеры; сохранённые публикации обновляются вручную.

**Tech Stack:** Vue 3, TypeScript, Vite, Vue Router, Tailwind 4, reka-ui/shadcn-style components, Node 24, SQLite, filesystem, PDF.js, WBook/JSZip, Chromium для сложных публичных страниц.

**Spec:** ../specs/2026-11-11-dreambusta-library-design.md и ../specs/2026-11-11-dreambusta-screens-design.md; пользователь после макетов утвердил Vue 3 и отдельный локальный Git в dreambusta.

## Global Constraints

- Только локальный запуск; не размещать приложение, не добавлять remote и не переносить библиотеку исходного WBook.
- Один materialId, читаемые slug без GUID, исторические адреса не переиспользуются.
- Share-содержимое сохранено; открытие не загружает источник. Ручной отказ не удаляет снимок без явного завершения обновления.
- PDF без текста доступен визуально. DOCX — readOnly. PPTX — статические слайды, без анимации.
- Управление и загрузка требуют редактора; первый редактор создаётся с локального компьютера без предзаданного пароля.
- Исходники WBook доступны в baseline commit b5fb240; приложение E:/WBook/app не меняется. Старые React-файлы не участвуют в активной Vue-сборке.
- Каталог для локальной первой версии открыт; управление отдельно. Закрытый режим каталога можно включить в настройках. SSO и production-размещение не входят в текущий запуск.

## Review Focus

- Исторический slug не должен открыть другой материал после переименования: тест в materials.test.ts.
- Скрытый материал нельзя получить через прямой файловый URL: HTTP-тест в server.test.ts.
- Отказ share-обновления и timeout не должны стирать сохранённый текст: тест в shares.test.ts.
- PDF без текста и презентация без текста не должны отбрасываться книжной валидацией: тест в processing.test.ts.
- Перезапуск API должен сохранять карточки, порядок подборок и исходные файлы: интеграционный тест с временным каталогом.

## Task 1: Каталог, хранение и авторизация API

**Files:** shared/types.ts; server/store.ts; server/auth.ts; server/app.ts; tests/materials.test.ts; tests/server.test.ts; package.json; vite.config.ts; tsconfig.json.

**Interfaces:** Material с source/representations; Store создаёт/обновляет/разрешает material/collection по slug и alias; createApp({dataDir}) возвращает HTTP server. API /api/session, /api/setup, /api/login, /api/logout, /api/materials, /api/collections, /api/settings. Публичная выдача фильтрует visibility; мутации требуют session+CSRF.

- [ ] Написать и запустить падающие тесты сохранения/slug/авторизации/перезапуска.
- [ ] Реализовать SQLite store, сессии, маршруты и проверки доступа.
- [ ] Запустить тесты Task 1 и существующие unit-тесты WBook.
- [ ] Коммит Task 1.

## Task 2: Загрузка файлов, текст и представления

**Files:** server/uploads.ts; server/processing.ts; server/conversion.ts; server/media.ts; tests/processing.test.ts.

**Interfaces:** processFile(path,name) возвращает metadata/paragraphs/html/pdf/scene/states; upload сохраняет оригинал потоково, регистрирует материал и запускает обработку. GET /api/materials/:id/file/:representation проверяет доступ и поддерживает Range для медиа. PATCH карточки и POST новой версии сохраняют materialId.

- [ ] Падающие тесты MD/TXT, PDF без текста, неправильных файлов, Range и отказа неавторизованной загрузки.
- [ ] Подключить импортёры WBook, Markdown, PDF, DOCX readOnly, PPTX; серверную Office-конверсию при наличии LibreOffice.
- [ ] Проверить реальные fixtures, лимиты и независимые состояния представлений.
- [ ] Коммит Task 2.

## Task 3: Внешние источники и ручное обновление

**Files:** server/sources/network.ts; server/sources/techhelper.ts; server/sources/buildin.ts; server/sources/video.ts; server/shares.ts; tests/shares.test.ts.

**Interfaces:** resolveLink(url) → source descriptor; importShare(url) → разрешённая publication; POST /api/links/preview, /api/links, /api/materials/:id/refresh; confirmUnavailable отдельно прекращает доступ к сохранённой версии. Buildin сохраняет основную статью, а не всю навигацию.

- [ ] Падающие тесты определения провайдера, сохранённого текста без fetch при чтении, отказа/timeout обновления и явного завершения.
- [ ] Реализовать адаптеры, проверку внешних URL/редиректов, очистку опубликованного HTML, сохранение разрешённых ресурсов.
- [ ] Проверить присланный публичный пример Buildin; TechHelper проверять по контракту локального API, без использования паролей Академии.
- [ ] Коммит Task 3.

## Task 4: Vue оболочка, каталог и управление

**Files:** src/main.ts; src/App.vue; src/router.ts; src/api.ts; src/style.css; src/components/*; src/pages/Catalog.vue, Collections.vue, Collection.vue, Login.vue, AdminMaterials.vue, AddMaterial.vue, EditMaterial.vue, EditCollection.vue, Sources.vue.

**Interfaces:** клиент API сохраняет CSRF сессии; роуты /library, /library/:slug, /collections, /collections/:slug, /admin/*. Карточки используют настоящие данные API, а не mockup fixtures. Авторизация не открывает скрытые файлы публично.

- [ ] Проверить падающим browser/API сценарием: добавление MD и появление в каталоге.
- [ ] Реализовать responsive UI по макетам, поиск/фильтры, формы, видимость, обложки, порядок drag/drop, чистые URL и copy-link.
- [ ] Проверить CRUD после перезагрузки, неправильный ввод и мобильную ширину.
- [ ] Коммит Task 4.

## Task 5: Просмотрщики и читалка Vue

**Files:** src/pages/Material.vue; src/components/viewers/PdfViewer.vue, DocxViewer.vue, SlidesViewer.vue, ArticleViewer.vue, MediaViewer.vue; src/components/Reader.vue; src/composables/useReading.ts.

**Interfaces:** доступные режимы происходят из representations. Reader использует lib/reader.ts; прогресс хранится по materialId+textVersion+mode в localStorage. Старая позиция не выдаётся за точное соответствие новой версии.

- [ ] Browser тест выбора текст/скорочтение, сохранения скорости/позиции и PDF без текста.
- [ ] Реализовать реальные рендеры, PDF worker, картинки/таблицы DOCX, статические PPTX, видео/аудио и текст расшифровки при наличии.
- [ ] Проверить клавиатуру, жест, длинное слово, мобильные размеры, unmount/отмену устаревшего PDF render.
- [ ] Коммит Task 5.

## Task 6: Проверка, документация и локальный запуск

**Files:** tests/e2e.mjs; README.md; docs/implementation-status.md; scripts/dev.mjs; server/index.ts; AGENTS.md.

- [ ] Полный npm test, npm run typecheck и npm run build; meaningful HTTP/browser сценарии с временной библиотекой.
- [ ] Запустить локальную библиотеку; открыть во внутреннем браузере. Первый редактор создаётся пользователем, тестовые credentials не сохраняются в рабочую БД.
- [ ] Независимый code review; исправить критичные/существенные находки и повторить затронутые проверки.
- [ ] Описать запуск, резервное копирование, переменные, формат данных, фактически проверенные форматы и ограничения конвертера/провайдеров.
- [ ] Итоговый коммит. Нет push, merge в родительский репозиторий или размещения.

## Execution ledger

Выполнение — в текущем отдельном репозитории, на рабочей ветке. Пользователь уже попросил собрать утверждённый проект, повторное согласование плана не требуется. Локальные коммиты создаются по завершении блоков. Учёт шагов и решений — docs/implementation-status.md; обобщённая запись перед итогом — E:/DA/PROJECT_LOG.md.
