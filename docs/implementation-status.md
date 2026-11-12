# DreamBusta implementation ledger

Plan: docs/superpowers/plans/2026-11-11-dreambusta-vue.md

- Baseline b5fb240: imported WBook and design sources preserved in the explicitly requested nested repository. No remote.
- Work branch: feat/vue-library. User authorized implementation after reviewing mockups and choosing Vue.
- Baseline verification: 12 reader/library/API utility tests PASS.
- Pre-flight: Task 1 Store/Material interfaces are consumed by uploads, shares and Vue API. All use stable IDs internally and slugs externally. Representations and source remain separate.
- Pre-flight: WBook rejects empty text; Task 2 must bypass that validation for visual-only PDF/slides/media while preserving book importer behavior.
- Ruling: execute in the explicitly requested nested repository, no additional worktree. This keeps the user's requested path intact; local baseline commit protects the imported state.
- Ruling: Node 24 + SQLite/filesystem for the initial independent local server. Cloudflare-specific routes remain historical source, not the active Vue backend. Production storage remains a separate deployment decision.
- Ruling: Vue frontend uses port 5175 and API 5176 to avoid disturbing the existing reader and mockup gallery. The dev server binds 0.0.0.0 for phone testing.

## Progress

- Task 1: complete — persistent store + auth/CSRF/visibility; 17/17 targeted tests. Commit e264867.
- Task 2: complete — streamed uploads, preserved originals, MD/TXT/WBook/PDF, media Range, DOC converter adapter and native PPTX parser; full suite 35/35 PASS.
- Ruling: PPTX uses the actual DreamAgent Desktop parser and static Vue scene renderer because LibreOffice is absent. Warn about unsupported objects/animation. Original retained; DOC requires installed converter. This enables local slide viewing now with less fidelity for complex decks than Office PDF conversion.
- Ruling: TechHelper DOCX source is vendored as an isolated React 18 readOnly island in Vue. Standalone builds do not depend on E:/DA paths.
- Task 3: complete — bounded public HTTP adapter with DNS pinning/redirect validation, Buildin main-article block extraction, TechHelper published JSON, raster snapshot resources and manual refresh/revocation policy. 3 source unit tests + live anonymous Buildin example PASS.
- Vue catalogue/collections/editor forms/viewers/reader use real persistent API; no demo materials in working data directory.
- Browser finding: Vite string proxy shorthand changes Host. Replaced with explicit changeOrigin:false; origin/CSRF protection remains enabled.
- Regression: DOCX empty text must retain visual representation; processor uses raw WBook DOCX extractor without book text validation. Office tests PASS.
- Task 4: complete — actual Vue catalogue, collections, protected editor, uploads/link/article forms, metadata/visibility/cover/settings and source management; browser CRUD workflow PASS.
- Task 5: complete — PDF worker/canvas, TechHelper React readOnly Word, static native slides, media, WBook focus/hold/keys/virtual text/word selection/local progress; browser PDF scan/Word table/ordered PPTX/large book/WAV PASS.
- Task 6: complete — 48/48 unit/HTTP tests, vue-tsc and Vite production build PASS. Browser workflow and anonymous Buildin smoke PASS. Independent review findings fixed and verified below.
- Security regression: delayed setup body previously allowed a second first editor; reproduced with a held HTTP request, fixed by transactional recheck. Vite supplies actual client address so LAN clients cannot bootstrap via loopback proxy. Origin checking retained.
- Ruling: legacy WBook data/URLs/progress are not migrated because the copied project intentionally contains no personal library. Historical sources remain in baseline. A separate migration would be needed to preserve old installations' URLs.
- Ruling: initial TechHelper native documents use saved article structure (including tables); published PDF previews are stored separately. No private original URL is fetched. Exact rich editor fidelity and SSO require further integration against real sample shares.

## Final review and verification

- Independent read-only review of b5fb240..326f1ab returned five actionable findings. All five accepted on actual impact; no Critical/Important finding deferred. One fix pass, no second review loop.
- P1: Vite exposed private data through static URLs. A failing HTTP test reproduced anonymous 200 for the database. Storage is now denied, including custom DATA_DIR and /@fs/ URLs. Configuration under public assets/build output or containing the source root is rejected. Regression tests PASS.
- P1: delayed refresh could restore an explicitly revoked publication or overwrite a replacement. Failing tests reproduced restoration and concurrent texts sharing one version. Store revisions now reject stale commits with HTTP 409, also covering uploads, cover and transcript updates. Tests PASS.
- P1: preview/image failures could discard part of a saved publication. A failing test reproduced PDF loss; refresh now commits the complete new snapshot or preserves the complete prior one. PDF and image failure/recovery tests PASS.
- P2: PDF/slides lost visual positions across modes. Browser regression reproduced the reset. Page/slide and zoom are stored per material/content version; reopening restores them, out-of-range positions clamp and a new version has separate progress. Browser checks PASS.
- P2: substantial decks lacked navigation/zoom. Added direct page input, thumbnails, zoom with internal scrolling and fullscreen. A failing browser check preceded the implementation; a dense 20-slide deck on 390px screen now passes all controls and overflow checks. Final mobile screenshot inspected.
- Acceptance closure: streamed SHA-256 detects identical uploaded files; normalized source URLs detect repeated links. Re-import returns a useful conflict pointing to the existing card. Failing HTTP/source tests preceded the fix; tests PASS. Store checks also cover concurrent imports.
- Final verification: 48/48 tests; vue-tsc --noEmit; Vite build; isolated Playwright E2E; live anonymous Buildin — PASS. DOC conversion was not tested because LibreOffice is absent. Real TechHelper rich-document/SSO compatibility and remote video playback remain integration checks, not claimed verified.
- Minor build warning retained: lazily loaded readOnly Word viewer is about 988 kB minified / 295 kB gzip. Static PPTX fidelity limits remain documented. No unrelated speculative changes or extra review rounds.
- Completion ruling: keep feat/vue-library in the explicitly requested nested repository with no remote. No merge, push, submodule registration or deployment. The user already chose this handoff arrangement; no additional finishing menu is needed.


## Дерево публичной публикации — 11 ноября 2026

- По умолчанию TechHelper/Buildin сохраняют статью со всеми подстраницами. При импорте доступны одна статья и всё публичное меню с исключением страниц галочками. Выбранный режим/адреса сохраняются в source.importOptions.
- Публичное меню Buildin обнаруживается по предкам/подстраницам анонимного api/docs; соседние страницы не попадают в выбранную ветку. Обход личного workspace не используется. Подстраницы под обычными блоками сохраняют ближайшего родителя-статью.
- Справа — раскрывающееся дерево с текущей страницей, на телефоне оно изначально свёрнуто. Отдельные режимы «Статья», «Текст», «Скорочтение» и читаемые постоянные адреса сохранены.
- Кнопка «Обновить ветку» повторяет сохранённый выбор одной операцией. Открытие страниц работает с локальной копией. Неудачное обновление сохраняет прежнюю ветку целиком; режим ветки подхватывает новые подстраницы.
- Ограничения: 100 страниц / 100 МБ вместе с ресурсами. Превышение глубины/блоков явно завершает импорт ошибкой. Сложные блоки Buildin могут отображаться текстом; это прежнее ограничение адаптера.
- Независимая проверка нашла 3 P2: варианты URL Buildin, молчаливое усечение глубины, поглощение общего лимита картинкой. Все воспроизведены падающими тестами и исправлены одним проходом; важных отложенных замечаний нет.
- Финальные проверки: 61/61 unit/HTTP, vue-tsc, Vite build, isolated E2E (включая keyboard/mobile tree) — PASS. Живая анонимная ссылка Buildin: 10 страниц выбранной ветки, 92 страницы публичного меню — PASS. Рабочий локальный Buildin обновлён, адрес buildin-developer-guide сохранён.
- Работа остаётся в feat/vue-library без remote; прежние несохранённые изменения сохранены, коммиты/публикация не выполнялись.


## Иконки и компоновка публикаций — 11 ноября 2026

- По уточнению пользователя дерево «Страницы публикации» перенесено вправо. Статья занимает левую основную колонку с центрированным текстом; мобильное дерево по-прежнему сворачивается.
- Исправлен общий CSS input: радиокнопки больше не получают ширину/высоту текстовых полей. Browser regression проверяет размеры, левое выравнивание и правое расположение дерева.
- Buildin page.data.icon сохраняется для страницы/дерева: emoji, загруженная картинка/SVG, внешняя картинка и штатная icon. Публичный file/create_urls используется анонимно только для иконки опубликованной страницы; подпись не хранится, сохраняются локальные байты. Растровые иконки Buildin запрашиваются с поддерживаемым источником уменьшением до 128px. SVG очищается до векторных фигур и выдаётся с CSP sandbox.
- Иконка отображается в дереве и над статьёй. При чтении сохранённых страниц изображения иконок доступны через локальный API. Ошибка получения иконки при обновлении сохраняет прежнюю публикацию.
- В существующей локальной библиотеке иконки добавлены без переимпорта контента: Help center — 90 иконок на 92 страницы (две страницы без иконки у источника), Buildin Developer Guide — 10 из 10.
- Финальная проверка: 62/62 unit/HTTP, vue-tsc, Vite build и изолированный E2E — PASS. В рабочем браузере проверены компактные радиокнопки, сохранённый логотип/emoji и расположение дерева справа; снимки сохранены в игнорируемой .superpowers/e2e/.

## Размещение на VPS — 11 ноября 2026

- По явному запросу пользователя DreamBusta размещена на 45.9.12.136: https://dreambusta.45-9-12-136.sslip.io/library. Используются отдельные /opt/dreambusta, /var/lib/dreambusta, системный пользователь, systemd unit и Nginx vhost. Node 24 установлен внутри каталога DreamBusta, глобальный Node 22 не менялся.
- Первичный согласованный снимок: 6 материалов, 81 уникальный файл, существующий редактор. Активные сессии очищены только в экспортированной копии. Локальная библиотека не менялась; последующие данные на сервере независимы и не должны заменяться при обновлении исходников.
- HTTPS Let's Encrypt, автозапуск и существующее автоматическое обновление сертификатов включены. API доступен только через loopback 5276 и HTTPS proxy. Nginx выдаёт готовую dist/.
- Проверки снаружи: HTML/JS, каталог и содержимое всех 6 перенесённых материалов, 82 файловых URL со сверкой байтов, запрет анонимной записи и недоступность SQLite как файла — PASS. Каталог проверен в браузере. Владелец уже добавил новый материал после запуска; новые записи сохранены.
- WBook до и после отвечает HTTPS 200, MainPID 7881 и время запуска не менялись. Контрольные суммы его Nginx vhost, systemd unit и глобального nginx.conf совпадают. Резервная копия конфигураций создана до изменений. Подробности эксплуатации: deploy/dreambusta/README.md. Пароль VPS в файлы/репозиторий не записывался.

## Локальный запуск 5173 и исправление PPTX — 11 ноября 2026

- По запросу пользователя локальный Vue dev server перенесён на 5173 с --host 0.0.0.0. API остался на 5176; localhost и LAN 192.168.0.136:5173 отвечают 200. Preview/default WEB_PORT и инструкции обновлены.
- Причины искажения: пустой a:ln получал выдуманный чёрный stroke; отсутствующий Liter не имел sans-serif fallback; Vue показывал весь абзац стилем первого run. Добавлены корректная обработка пустой обводки, шрифтовая подстановка и отдельные стили runs.
- Скруглённый прямоугольник с неподдержанной тенью сохраняется как скруглённая плашка. Эффекты упрощены с понятным предупреждением; неизвестные сложные фигуры не заявляются поддержанными. У маленьких заглушек убрана нечитаемая техническая подпись.
- Проверка воспроизведена падающими unit/E2E до исправления. Финал: 63/63 unit/HTTP, typecheck, production build и isolated E2E — PASS. На исходной DreamAgent — Corporate AI Operating System.pptx в браузере проверен второй слайд, скриншот .superpowers/e2e/local-slides-fixed-5173.png.
- В локальную библиотеку добавлена эта реальная презентация; у ранее сохранённой презентации пересобран только preview в новый файл. Оригиналы, адреса, тексты и textVersion сохранены. Серверное размещение в этом локальном исправлении не обновлялось.

## Таблицы PPTX и серверный PDF — 11 ноября 2026

- В PPTX graphicFrame с DrawingML table раньше становился заглушкой «Таблица». Добавлена модель только для чтения, импорт сетки/ячеек/объединений, явных границ/заливок, отступов и форматированного текста. Vue показывает HTML-таблицу внутри SVG foreignObject. Продолжения объединённых ячеек не дублируются.
- Табличный текст извлекается по строкам для «Текста» и «Скорочтения». Обход и рендер группируют ячейки за линейное время. Число ячеек ограничено 100000; недопустимые размеры/объединения отклоняются. Нулевые высоты строк из реального Office-экспорта допускаются. Автоматические стили из темы не заявлены полностью поддержанными.
- Три новых unit-регрессии и browser-регрессия сначала воспроизвели отсутствие таблицы/текста и ошибку нулевой строки. Финальные проверки: 66/66 unit/HTTP, vue-tsc, Vite build, isolated E2E — PASS. Существующие предупреждения сборки lazy Word и React use-client сохранены.
- У локальных PPTX пересобраны preview и извлечённый текст с сохранением оригиналов/названий/адресов; textVersion увеличивается только при изменении текста. В «Атрибутивная карта_приоритет 3» проверены третий слайд, 24 строки и 96 ячеек, всего в материале 789 слов. SHA-256 исходного PPTX остался 1bb0be9e27acb969e7bcbef58ce09f7006548b1bea5397c02fc93acaca17a1b9. Снимок: .superpowers/e2e/local-pptx-table-fixed.png. Новая поддержка таблиц остаётся локально на 5173, API перезапущен.
- По следующему сообщению пользователя исправлен серверный PDF: Nginx выдавал существующий pdf.worker.min-B_fnEKel.mjs как application/octet-stream при nosniff. В vhost только DreamBusta добавлен JavaScript MIME для /assets/*.mjs; nginx -t PASS, выполнен reload. Конфигурация сохранена в /root/dreambusta-nginx-before-pdf-20261111T071127Z.conf. Код приложения и серверная библиотека не заменялись.
- Проверено снаружи: worker 200 application/javascript, отсутствующий worker 404. В браузере исходный PDF открывает все 21 страницу, проверены переход на вторую страницу и масштаб. PDF.js тот же движок, что в проверенном FilePdfViewer TechHelper. WBook отвечает 200, MainPID 7881 и контрольные суммы его vhost/unit не изменились. В открытой старой вкладке может понадобиться Ctrl+F5 из-за ранее закэшированного MIME.

## PDF, векторные слайды и большие книги — 11 ноября 2026

- Внешние YouTube/Rutube/VK iframe загружаются сразу при открытии материала. Промежуточная кнопка убрана, autoplay не добавлен. В рабочей библиотеке Rutube показал обложку и кнопку воспроизведения без активации со стороны приложения; фактическое проигрывание всех провайдеров не заявляется проверенным.
- PDF переведён на PDFViewer того же PDF.js: непрерывная вертикальная прокрутка, выбор текста и ссылки, миниатюры слева с отложенным рендером, переход по номеру, масштаб и сохранение страницы. На телефоне миниатюры изначально скрыты, открываются кнопкой.
- Пустые страницы реальной книги «Ника М. — Создание продуктов на базе ИИ» вызваны отсутствующими кодеками JPEG2000: 226 страниц являются сканами JPXDecode. Добавлена локальная выдача version-matched wasm, fallback JS, cmaps и шрифтов в dev/build. Синтетический JPX PDF сначала провалил проверку цветных пикселей, затем прошёл. В браузере у реальной книги видны сканы, миниатюры и непрерывная прокрутка. Текстового слоя в исходнике нет; OCR не добавлялся.
- Обнаружен и воспроизведён падающим E2E конфликт официального CSS PDF.js с .sidebar приложения. Весь upstream CSS теперь ограничен @scope (.pdf-workspace), включая переменные корня. Регрессия подтверждает фиксированную навигацию; страницы и текстовый слой продолжают отображаться.
- PPTX custGeom с явными числовыми M/L/C/Q/Z координатами и круглый радиальный градиент с alpha теперь читаются в ограниченную модель только для просмотра. SVG использует отдельные ID градиентов для каждого экземпляра. Формулы и неподдержанные команды сохраняют заглушки. Unit/E2E регрессии сначала воспроизвели отсутствие контуров, затем прошли. В рабочей DreamAgent — Corporate AI Operating System на первом слайде показаны 7 иконок и 2 декоративных градиента вместо заглушек. У двух локальных PPTX пересобраны производные preview с сохранением оригиналов и адресов.
- Общий лимит извлечённого текста поднят с 10 до 50 МиБ; оба валидатора используют байты UTF-8. Локальный API перезапущен, чтобы новые загрузки выполнялись новым обработчиком. Единственная сохранившаяся ошибка старого лимита повторно обработана из исходника: chernoknijnik-v-mire-magov-2, 21 489 689 байт текста, 80 715 абзацев, 1 741 804 слова, state=ready. SHA-256 оригинала, slug и метаданные сохранены; прежняя запись лежит в игнорируемой .superpowers/repair-backups. Чтение проверено в браузере, материалов с state=error в локальной библиотеке не осталось. Это исправление сохранённой записи, а не подмена надписи об ошибке.
- В Word скрыта плашка «Только просмотр — редактирование недоступно» только внутри .docx-island. readOnly остался включён; в реальном документе баннер невидим, contenteditable=true отсутствует, текст отображается.
- Финальная проверка: 67/67 unit/HTTP, vue-tsc, production build, isolated E2E — PASS. Синтетические fixture используются только во временной базе E2E. Все изменения этой итерации доступны локально на 5173 (--host 0.0.0.0), API 5176. На VPS эти изменения не выкладывались; данные сервера не заменялись.

## WBook по главам и переключение страниц PDF — 11 ноября 2026

- Вкладка «Скорочтение» переименована в WBook; обычный «Текст» остался отдельным. Внутреннее значение speed сохранено, поэтому прежний выбор режима и прогресс работают.
- WBook получил переключатель «Читать по главам», предыдущее/следующее начало главы, оглавление с поиском и остановку на последнем слове главы. Виртуальный контекст ограничивается главой с исходными глобальными индексами слов. Переключение к полному тексту и обратно не сбрасывает позицию.
- Родное оглавление EPUB2 NCX / EPUB3 nav сохраняется как {title,paragraph}; учитываются anchors в одном файле, порядок spine и удаление пустых абзацев при нормализации. Автоопределение служит запасным вариантом. Своё начало заголовка — буквальная строка до 80 символов, заголовок — короткий абзац до 180 символов. Пустая выборка не заменяет рабочую настройку. Есть предпросмотр и «Убрать разбивку» (сбрасывает своё правило и показывает всю книгу).
- Ruling: настройки глав хранятся в браузере по materialId/textVersion, как прогресс; оригинал и текст не разрезаются на отдельные материалы. Чтение останавливается у границы главы, продолжение выбирается пользователем. Текст до первой главы остаётся вступлением.
- У двух существующих локальных EPUB добавлены только главы после сверки всего извлечённого текста: chernoknijnik-v-mire-magov-2 — 1200 нумерованных глав и вступление; farrell-adler-i-dvayer-2-ya-vse-znayu — 67 разделов. Прежние записи сохранены в игнорируемой .superpowers/repair-backups. SHA-256 оригиналов и textVersion не изменились.
- По уточнениям пользователя левая панель PDF теперь изначально закрыта на всех экранах, открывается/скрывается кнопкой «Страницы». В панели есть оба вида: «Список» и «Миниатюры». Переключение и изменение ширины не сбрасывают страницу; в списке нет лишнего рендера canvas. Миниатюры остаются отложенными.
- Независимый read-only обзор нашёл один P2: неправильный URL в необязательном оглавлении EPUB отклонял читаемую книгу. Два случая воспроизведены падающими тестами; обработка TOC изолирована, ошибки не отбрасывают валидный spine. Лимит распаковки продолжает прерывать обработку. Других важных замечаний не найдено; выполнен один проход исправления.
- Проверки: 76/76 unit/HTTP и vue-tsc PASS. Production build PASS; isolated E2E PASS, включая границы глав, поиск, свой маркер, отсутствие совпадений, возврат к полному тексту, сброс, reload, телефон и PDF list/thumbnail/toggle. Локальный сервер 5173 с --host 0.0.0.0; публикация на VPS не выполнялась.

## Полное меню и иконки Buildin — 12 ноября 2026

- Причина неполного импорта: публичный api/docs отдаёт дерево частями; прежнее меню строилось только из одного ответа. Теперь связанные публичные страницы запрашиваются с ограничением параллелизма 4, циклы исключаются, порядок и родительские связи сохраняются. Ответы используются повторно при сохранении содержимого и учитываются в общем лимите один раз.
- Лимит увеличен до 500 страниц, совокупный размер остался 100 МиБ. Превышение лимита и сбой вложенной страницы отклоняют обновление с сохранением предыдущего снимка.
- Заголовки страниц берутся из видимых data.segments с запасным вариантом title. Служебный префикс 副本 в копиях источника больше не подменяет видимый заголовок. Настоящие emoji/загруженные/SVG-иконки выводятся внутри ссылок и сохраняются локально; декоративные иконки исключены из текста для чтения. Обычные ссылки segments.url и адреса Buildin вида /UUID сохраняются и нормализуются.
- По пользовательской витрине анонимно обнаружены 364 страницы (52 570 473 байта ответов документов). Полный снимок с 99 файловыми ресурсами проверен во временной базе; сложные блоки по-прежнему могут представляться текстом. Снимок локального материала сначала обновлён с резервной копией и сохранением адресов; затем пользователь удалил материал и явно подтвердил, что восстанавливать его не нужно. Материал оставлен удалённым.
- Проверки: регрессии сначала воспроизвели неполное меню и неправильные подписи. Итог — 82/82 unit/HTTP, vue-tsc, production build и isolated E2E PASS, включая размеры inline-иконок и внутренние ссылки. API 5176 и Vue 5173 перезапущены локально; исходники и данные VPS не обновлялись.
- Отдельно по явному запросу установлен Codex grill-me из mattpocock/skills вместе с зависимостью grilling. RAG пока не реализован; целевой сервис для дальнейшего обсуждения — только DreamBusta.
# Собственный поиск и RAG — 12 ноября 2026

- По согласованному поведению реализованы оба этапа: общий поиск содержимого
  и ответы по найденным источникам. Пользователь отдельно выбрал собственный
  движок в DreamBusta, без подключения к сервисам ТХ/AIMOS.
- SQLite FTS5 + локальные векторы + RRF, автоматический индекс, ограниченная
  очередь с повтором и изоляцией плохих входов. Сохраняются отдельные адреса
  абзацев, вложенных страниц, PDF-страниц и слайдов; смена типа файла очищает
  старую карту страниц. Индекс переживает перезапуск и проверяет текущую версию.
- Ctrl/Cmd+K и кнопки открывают адаптивное окно: тип/подборка/текущий материал,
  подсветка, клавиатура, пагинация, ответы и ссылки на источники. Старые ответы
  очищаются при повторном открытии, новом запросе и смене области.
- Генерация — локальная gemma4:e2b, эмбеддинги — embeddinggemma через Ollama.
  В реальной временной библиотеке проверены поиск по смыслу и ответ о том,
  кто утверждает договор и за какой срок, со ссылкой на регламент.
- Тесты проверяют фильтрацию доступа до выдачи/пагинации, закрытую библиотеку,
  скрытые источники, изменения во время embedding/generation, неверные векторы
  и ссылки, отказы runtime, возобновление индекса и точные переходы в браузере.
- Рабочие материалы и оригиналы не заменяются. Удалённая пользователем витрина
  остаётся удалённой. Изменения сервиса остаются локальными; публикации на VPS нет.
- Проверка масштаба: рабочие 14 материалов дали 15 244 структурных блока вместо
  141 143 абзацных. На временной копии с синтетическими 768-мерными векторами
  полный векторный индекс занимает 46 829 568 байт; поиск с FTS/фильтрацией/
  точным сравнением занимает 285–347 мс. Это замер поиска без затрат на модель.
- Компактные блоки сохраняют точный абзац и смещение; переход внутрь слова
  исправлен по воспроизведённой браузерной регрессии. Запись векторов выполняется
  транзакцией на порцию, изменённые источники не получают устаревших векторов.
- После объединения абзацев реальная gemma4:e2b возвращала пустой ответ на
  источник с двойным переводом строки. Сравнение одинаковых текстов с разными
  разделителями подтвердило причину; вход модели сохраняет одиночные переводы
  строк. Оригиналы и цитируемый текст не меняются; реальный RAG smoke снова PASS.
- Итоговая проверка: 99/99 unit/HTTP, vue-tsc, production build, обычный и
  поисковый E2E, настоящий локальный RAG smoke — PASS. Полнотекстовый индекс
  рабочей библиотеки готов; векторы автоматически достраиваются в фоне.

## Виджет помощника — 12 ноября 2026

- По уточнению пользователя верхний поиск и Ctrl/Cmd+K сохранены. Вопросы и
  ответы перенесены в отдельный виджет: кнопка справа внизу, перетаскивание с
  сохранением позиции, компактное окно и разворачивание, полноэкранный телефон.
- Оболочка адаптирована из реального TechHelper ChatWidgetShell.vue / ChatHeader.vue
  (локальный HEAD 2250c8f13), Send/Stop — из MessageInputActions.vue. Рантайм и API
  принадлежат Дримбусте; исходники ТХ прочитаны без изменения.
- Прямой вопрос, передача вопроса/фильтров из поиска, выбор области, история до
  20 самостоятельных вопросов в памяти вкладки, ссылки к точным фрагментам,
  отмена, повтор и новый диалог. Смена доступа очищает историю; перезагрузка
  также очищает её. Контекст прошлых реплик не отправляется модели.
- Ревью выявило две ошибки. Поздний /collections мог вернуть старый вопрос
  после нового; добавлена проверка поколения при закрытии/новом диалоге/смене
  доступа. Область «текущий материал» сохранялась после выхода из него;
  теперь сбрасывается. Обе регрессии воспроизведены RED→GREEN в браузере.
- Проверка: 99/99 unit/HTTP, vue-tsc, build, общий и поисковый E2E, повторный
  локальный RAG smoke PASS. E2E дополнительно проверяет гонки нового диалога,
  остановку ответа, историю, передачу фильтров, drag, разворачивание и телефон.
- Хеши 14 рабочих материалов сохранены; смысловой индекс полностью подготовлен:
  15 244 / 15 244 вектора, indexing=false. Изменения только в DreamBusta локально.

## Ложный отказ помощника — 12 ноября 2026

- На реальных фрагментах DreamAgent Web локальная gemma4:e2b возвращала
  пустой ответ при JSON-входе, хотя источники содержали нужные права согласования.
  Сравнение одинаковых источников подтвердило причину: теперь они передаются
  нумерованным текстом. Модель, схема JSON-выхода и проверка цитат сохранены.
- При отсутствии подтверждённого ответа и при недоступности модели видны
  близкие материалы. Перед их выдачей повторно проверяются доступ и версия;
  изменение доступа во время генерации аннулирует ссылки.
- Общий вопрос «кто согласует договор» не даёт подтверждённого ответственного
  в текущих материалах: помощник предлагает уточнить вопрос и открыть источники.
  Вопрос «Кто может согласовывать задачи в DreamAgent Web?» проверен через
  рабочий API: ответ о праве согласования содержит ссылку на документацию.
- Проверки: 100/100 unit/HTTP, vue-tsc, production build, общий и поисковый E2E
  PASS. Реальная модель проверена на регламенте, нескольких фрагментах
  документации и отрицательном вопросе без сведений. Рабочие материалы сохранены;
  изменения остаются локальными.

## Команды запуска и обслуживания — 12 ноября 2026

- Добавлены Makefile и npm-команды для запуска, doctor, check, verify и release.
  Release последовательно выполняет проверки и E2E, затем создаёт TGZ с SHA-256;
  при ошибке упаковка не выполняется. Явный список файлов исключает рабочую
  библиотеку, окружение и сессии. Упаковка отдельно доступна через release:pack.
- Linux-команды показывают состояние/логи systemd, перезапускают только DreamBusta
  и резервируют библиотеку с остановкой сервиса и восстановлением прежнего
  состояния запуска. На Windows доступны npm-эквиваленты без установки Make.
- Проверены unit/HTTP, typecheck, build, E2E, doctor и настоящий архив релиза;
  GNU Make dry-run и Bash syntax — в WSL. Операции systemd/backup на VPS не
  выполнялись. Рабочие 14 материалов и 15 244 вектора сохранены.
