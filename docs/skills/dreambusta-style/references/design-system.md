# Токены и компоненты

Источник: `src/style.css`, `src/reading.css`, `src/components/assistant/ChatWidgetShell.vue` Дримбусты на `62ad3b2`. Значения — действующая база, а не универсальное требование к любому продукту. Переиспользуй адаптивные компоненты целевого приложения.

## Палитра

Полный CSS с семантическими переменными: `../assets/dreambusta-tokens.css`. Тёмная тема включается классом `.dark` на корневом элементе.

| Переменная | Светлая | Тёмная |
|---|---|---|
| background | #ffffff | #18181b |
| foreground | #18181b | #fafafa |
| primary | #27272a | #d4d4d8 |
| primary-foreground | #ffffff | #18181b |
| card, popover | #ffffff | #202023 |
| card-foreground, popover-foreground | #18181b | #fafafa |
| secondary, muted | #f4f4f5 | #27272a |
| secondary-foreground | #27272a | #e4e4e7 |
| muted-foreground | #71717a | #a1a1aa |
| accent | #f4f4f5 | #333338 |
| accent-foreground | #18181b | #fafafa |
| border | #e4e4e7 | #37373d |
| input | #e4e4e7 | #45454b |
| ring | #a1a1aa | #a1a1aa (наследуется) |
| sidebar | #fafafa | #202023 |
| success / success-bg | #237352 / #edf8f1 | #88d2ab / #1e3329 |
| warning / warning-bg | #94611c / #fff7e8 | #e9bd77 / #352d21 |
| destructive / danger-bg | #b13b40 / #fff1f1 | #f09ca3 / #3c2428 |

Радиус панели/карточки `--radius: 0.65rem` (10.4px при root 16px). Поля и обычные кнопки — 7px, навигация — 8px, icon-button — 6px. Тень применяется к приподнятому окну или hover, а не к каждой поверхности.

## Типографика и интервалы

- `Geist, "Segoe UI", sans-serif`, локальные WOFF2 400/500/600 приложены. Пути к шрифтам учитывают размещение приложения в подпапке; проверяй успешную загрузку.
- Интерфейс 14px/1.5. Кнопка 13px, 500, line-height 1.3. Метаданные 12px; компактные вторичные подписи 10–11px.
- h1 32px/1.2, 600, letter-spacing -1px. h2 20px/1.35, 600, -0.3px. h3 15px/1.4, 600. На телефоне заголовок страницы 29px, материала 25px.
- Статья/текст: line-height 1.6; абзацы/списки margin-block .5em; пункты списка .125em. Заголовки line-height 1.3 и margin `1.25em 0 .25em`. У первого содержательного элемента нет лишнего верхнего отступа.
- Промежутки управления 4/8/12px; групп 16–24px; поля панелей 24px. Не округляй всё приложение к новой шкале: существуют конкретные gap 19px и 22px.
- Для длинного текста `min-width:0`, при необходимости `overflow-wrap:anywhere`; соседние действия остаются на месте.

## Оболочка

| Область | Desktop | Адаптация |
|---|---|---|
| Левое меню | fixed, 236px; padding 28px 15px 18px; граница справа | до 1180px — 210px; до 800px — выезжающее меню 235px, контент без левого margin |
| Верхняя панель | sticky top 0; высота 70px; padding 0 36px; нижняя граница | до 800px — 61px, padding 0 17px; до 600px — padding 0 12px |
| Контент | max-width 1540px; margin auto; padding 40px 38px 60px | до 1180px — 30px 26px; до 800px — 28px 20px 45px |
| Верхний поиск | flex:1; min-width:0; рамка 1px; radius 8px; muted-фон | скрываются вторичные подсказки/shortcut; поле остаётся доступным |

Пункт меню: `grid-template-columns:18px minmax(0,1fr)`, gap 12px, padding 11px 12px, текст 13px. Активное состояние — secondary-фон и foreground-текст. Иконки стоят на одной вертикали.

Breadcrumbs: 12px, muted, разделитель `/`. Путь через подборку сохраняется во вложенных страницах материала; активная навигация соответствует контексту перехода.

## Сетки и карточки

Каталог: 3 равные колонки, gap 22px; от 1600px — 4; до 1180px — 2 с gap 16px; на узком телефоне — одна. Админские плитки: 3 колонки, gap 18px; до 1100px — 2; до 600px — 1.

Карточка: flex-column, тонкая граница, общий radius, overflow hidden. Соседи растягиваются по высоте; нижняя строка метаданных через `margin-top:auto`. Сетка владеет gap, у карточек нет случайных внешних margin. Hover подсвечивает границу/добавляет лёгкую тень, но `transform:none`: карточки не подскакивают.

Обложка: обычно 183px, padding 22px, заголовок 23px/1.18, до трёх строк; тело карточки padding 18px. Реальное изображение `object-fit:cover`.

| Обложка | Фон | Текст |
|---|---|---|
| Документ | #e9edf0 | #233944 |
| Книга | #eae3d8 | #645041 |
| Презентация | #e7e3ed | #514265 |
| Видео | #dfe9e6 | #315a4a |
| Аудио | #e8e0df | #6c4744 |

## Управление

Кнопка: min-height 40px, padding 10px 16px, gap 9px, border 1px. Основная — primary/primary-foreground. Обычная — background/foreground, hover secondary. Маленькая — min-height 33px, padding 7px 11px, 12px. Icon-button 33×33px, прозрачный фон, muted-иконка; hover muted-фон.

Поля: min-height 41px, padding 10px 12px, border input, background background; placeholder muted. `:focus-visible`: outline 2px ring, offset 3px. Активные кнопки имеют также `aria-pressed`/`aria-expanded`.

Lucide: 16–19px для большинства действий, около 25px в помощнике. Одинаковые размеры внутри группы. В PDF переключатели списка/миниатюр рядом с «Страницы», с tooltip и доступным именем.

## Читалка и правая панель

Рамка просмотрщика занимает доступную ширину слева. Внутри колонка текста max-width 780px; варианты 650px и 1040px. Колонка центрируется через margin-inline:auto, текст выровнен слева. Это не `text-align:justify` и не узкая рамка всего просмотрщика.

Один внутренний scroll-контейнер статьи/текста ограничен доступной высотой окна. Высота пересчитывается относительно верхних инструментов, min-height 200px; CSS fallback статьи — 500px. У flex/grid предков `min-height:0`; у контейнера `overflow:auto`, `overscroll-behavior:contain`, `scrollbar-gutter:stable`. Не заставляй читать длинную статью внешним скроллом страницы. Оглавление может прокручиваться отдельно, широкая таблица — горизонтально локально.

Поля статьи 28px 34px 42px; до 800px — 24px 20px 36px. Прогресс расположен внутри рамки над текстом: строка 11px и progress 5px. Это позиция чтения, а не оценка качества материала.

Справа панель обычно 240px, splitter 16px. «Оглавление»/«О материале» — кнопки в правой колонке; активная — background-карточка на muted-подложке. Свёрнутый desktop оставляет rail 44px и зазор 8px. Место под инструменты стабильно при переключении материалов. До 800px — один поток, splitter скрыт, действия справа, оглавление max-height 45vh. Пределы drag-resize бери из целевого компонента.

## Помощник и движение

Встроенный launcher: круг 56×56px, справа/снизу по 20px, primary-фон, MessageCircle. Окно 384×500px, radius 10px, максимум viewport минус 40px; развёрнутое шириной 600px. До 600px — 100vw×100dvh.

Кружок превращается в окно с общим нижним правым якорем, учитывая перетаскивание. Launcher скрывается и исключается из tab-порядка. Цветная форма остаётся видимой весь переход; содержимое проявляется отдельно с лёгким blur. Открытие около 420ms, закрытие 260ms; easing `cubic-bezier(.2,.8,.2,1)`. Крестик справа сверху сворачивает обратно, отдельной нижней кнопки нет. Escape закрывает, фокус возвращается на launcher, незавершённый переход можно прервать. При `prefers-reduced-motion:reduce` переход мгновенный.

Внешний embed сохраняет поведение, но имеет собственную геометрию: launcher-плашка «Помощник», отступ 16px, окно до 390×600px. Не подменяй его встроенным компонентом без запроса на перенос.

## Пример переноса базового компонента

После подключения CSS токенов:

```html
<section class="db-panel" aria-labelledby="material-title">
  <h2 id="material-title">Регламент согласования</h2>
  <p class="db-meta">Документ · обновлён 12 ноября</p>
  <button class="db-button" type="button">Открыть материал</button>
</section>
```

```css
.db-panel {
  display:flex; flex-direction:column; align-items:flex-start; gap:12px;
  min-width:0; padding:24px; border:1px solid var(--border);
  border-radius:var(--radius); background:var(--card); color:var(--card-foreground);
}
.db-panel h2 { margin:0; font-size:20px; line-height:1.35; font-weight:600; letter-spacing:-.3px; }
.db-meta { margin:0; font-size:12px; color:var(--muted-foreground); }
.db-button {
  display:inline-flex; align-items:center; justify-content:center; gap:9px;
  min-height:40px; padding:10px 16px; border:1px solid var(--primary);
  border-radius:7px; background:var(--primary); color:var(--primary-foreground);
  font:500 13px/1.3 Geist,"Segoe UI",sans-serif; cursor:pointer;
}
.db-button:hover { opacity:.88; }
.db-button:focus-visible { outline:2px solid var(--ring); outline-offset:3px; }
```
