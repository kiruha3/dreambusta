<script setup lang="ts">
import { paths } from "../lib/paths";
import { computed, ref, onMounted, onBeforeUnmount, toRaw } from "vue";
import type { Widget, WidgetState } from "../../shared/widgets";
import type { Material } from "../../shared/types";
import { api, send, notify, session } from "../api";
const widgets = ref<Widget[]>([]);
const materials = ref<Material[]>([]);
const current = ref<Widget>();
const origins = ref("");
const mode = ref("floating");
const error = ref("");
const busy = ref(false);
const loaded = ref(false);
const labels: Record<WidgetState, string> = {
  draft: "Черновик",
  published: "Опубликован",
  paused: "На паузе",
};
const saved = computed(() =>
  widgets.value.find((w) => w.id === current.value?.id),
);
const unavailableIds = computed(
  () =>
    current.value?.materialIds.filter(
      (id) => !materials.value.some((m) => m.id === id),
    ) || [],
);
const base = location.origin + paths.base;
const preview = ref<HTMLIFrameElement>();
function previewReady(event: MessageEvent) {
  const widget = current.value;
  const frame = preview.value;
  if (
    !widget ||
    !frame ||
    event.origin !== location.origin ||
    event.source !== frame.contentWindow ||
    event.data?.type !== "dreambusta:ready" ||
    event.data.widget !== widget.id
  )
    return;
  frame.contentWindow?.postMessage(
    { type: "dreambusta:context", widget: widget.id },
    location.origin,
  );
}
onMounted(() => window.addEventListener("message", previewReady));
onBeforeUnmount(() => window.removeEventListener("message", previewReady));
const code = computed(() => {
  if (!current.value) return "";
  const script =
    `<script src="${base}/embed.js" data-widget="${current.value.id}" data-mode="${mode.value}"${mode.value === "inline" ? ' data-target="dreambusta-assistant"' : ""} defer></` +
    "script>";
  return mode.value === "inline"
    ? '<div id="dreambusta-assistant"></div>\n' + script
    : script;
});
Promise.all([api<Widget[]>("/widgets"), api<Material[]>("/materials")])
  .then(([list, docs]) => {
    widgets.value = list;
    materials.value = docs;
    loaded.value = true;
    if (list[0]) select(list[0]);
  })
  .catch((e) => (error.value = e.message));
function select(widget: Widget) {
  current.value = structuredClone(toRaw(widget));
  origins.value = widget.allowedOrigins.join("\n");
  error.value = "";
}
async function create() {
  busy.value = true;
  error.value = "";
  try {
    const widget = await send<Widget>("/widgets", "POST", {
      name: "Новый помощник",
    });
    widgets.value.unshift(widget);
    select(widget);
    notify("Помощник создан");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function save(state?: WidgetState) {
  if (!current.value) return;
  busy.value = true;
  error.value = "";
  const w = current.value;
  try {
    const result = await send<Widget>(`/widgets/${w.id}`, "PATCH", {
      name: w.name,
      title: w.title,
      greeting: w.greeting,
      accentColor: w.accentColor,
      allowedOrigins: origins.value
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
      materialIds: w.materialIds,
      state: state || w.state,
      revision: w.revision,
    });
    widgets.value = widgets.value.map((x) => (x.id === result.id ? result : x));
    select(result);
    notify("Настройки помощника сохранены");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function remove() {
  if (
    !current.value ||
    !confirm(
      `Удалить помощника «${current.value.name}»? Код на сайтах перестанет работать.`,
    )
  )
    return;
  busy.value = true;
  error.value = "";
  try {
    await send(`/widgets/${current.value.id}`, "DELETE");
    widgets.value = widgets.value.filter((w) => w.id !== current.value!.id);
    current.value = undefined;
    if (widgets.value[0]) select(widgets.value[0]);
    notify("Помощник удалён");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function copy() {
  try {
    await navigator.clipboard.writeText(code.value);
    notify("Код скопирован");
  } catch {
    notify("Выделите и скопируйте код из поля ниже");
  }
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">УПРАВЛЕНИЕ</div>
      <h1>Внешние помощники</h1>
      <p>Вопросы по базе знаний Дримбусты на других сайтах.</p>
    </div>
    <button class="button primary" :disabled="busy || !loaded" @click="create">
      Создать помощника
    </button>
  </div>
  <div v-if="error" class="notice danger" role="alert">{{ error }}</div>
  <div v-if="session.closed" class="notice warning">
    Библиотека закрыта. Опубликованные помощники будут недоступны до открытия
    библиотеки.
  </div>
  <p v-if="loaded && !widgets.length" class="panel muted">
    Создайте помощника, укажите сайты для размещения и выберите материалы.
  </p>
  <div v-if="widgets.length" class="widget-editor">
    <nav class="panel widget-list" aria-label="Помощники">
      <button
        v-for="w in widgets"
        :key="w.id"
        type="button"
        :class="{ active: current?.id === w.id }"
        :disabled="busy"
        @click="select(w)"
      >
        <strong>{{ w.name }}</strong
        ><small>{{ labels[w.state] }}</small>
      </button>
    </nav>
    <div v-if="current" class="stack grow">
      <form class="panel stack" @submit.prevent="save()">
        <div class="row between wrap">
          <h2>Настройки помощника</h2>
          <span class="badge">{{ labels[saved?.state || current.state] }}</span>
        </div>
        <label class="field"
          >Название в кабинете<input
            v-model="current.name"
            required
            maxlength="120"
        /></label>
        <label class="field"
          >Заголовок окна<input
            v-model="current.title"
            required
            maxlength="120"
        /></label>
        <label class="field"
          >Приветствие<textarea
            v-model="current.greeting"
            rows="3"
            maxlength="1000"
          ></textarea>
        </label>
        <label class="field"
          >Цвет кнопок<input v-model="current.accentColor" type="color"
        /></label>
        <label class="field"
          >Разрешённые сайты<textarea
            v-model="origins"
            rows="3"
            placeholder="https://example.ru&#10;https://help.example.ru"
          ></textarea
          ><small class="muted"
            >По одному точному адресу HTTPS в строке, без пути и завершающего
            слеша. Для локальной проверки: http://localhost:порт.</small
          ></label
        >
        <fieldset class="stack">
          <legend>Материалы для ответов</legend>
          <p class="muted">
            Без выбора — все открытые материалы. Скрытые материалы и закрытая
            библиотека недоступны внешнему помощнику.
          </p>
          <div class="settings-materials">
            <label v-for="id in unavailableIds" :key="id" class="check-label">
              <input
                v-model="current.materialIds"
                type="checkbox"
                :value="id"
              />
              <span
                >Удалённый материал
                <small class="muted"
                  >{{ id }} · снимите выбор, чтобы сохранить настройки</small
                ></span
              >
            </label>
            <label v-for="m in materials" :key="m.id" class="check-label"
              ><input
                v-model="current.materialIds"
                type="checkbox"
                :value="m.id"
              /><span
                >{{ m.title
                }}<small v-if="!m.visible" class="muted"> · скрыт</small></span
              ></label
            >
          </div>
        </fieldset>
        <div class="row wrap">
          <button class="button primary" :disabled="busy">Сохранить</button
          ><button
            v-if="saved?.state !== 'published'"
            type="button"
            class="button"
            :disabled="busy"
            @click="save('published')"
          >
            Опубликовать</button
          ><button
            v-else
            type="button"
            class="button"
            :disabled="busy"
            @click="save('paused')"
          >
            Приостановить</button
          ><button
            type="button"
            class="button danger"
            :disabled="busy"
            @click="remove"
          >
            Удалить
          </button>
        </div>
      </form>
      <section class="panel stack">
        <h2>Размещение на сайте</h2>
        <p class="muted">
          Код работает после публикации на разрешённых сайтах. Помощник
          использует индекс и модель Дримбусты. Для размещения в интернете нужен
          доступный HTTPS-адрес этого сервиса.
        </p>
        <label class="field"
          >Вид размещения<select v-model="mode">
            <option value="floating">Плавающая кнопка</option>
            <option value="inline">Блок внутри страницы</option>
          </select></label
        >
        <label class="field"
          >Код для вставки<textarea
            :value="code"
            readonly
            rows="5"
            class="embed-code"
            @focus="($event.target as HTMLTextAreaElement).select()"
          ></textarea>
        </label>
        <button type="button" class="button self-start" @click="copy">
          Скопировать код
        </button>
        <template v-if="saved?.state === 'published' && !session.closed"
          ><a
            :href="`${base}/embed/${current.id}`"
            target="_blank"
            rel="noopener noreferrer"
            class="text-link"
            >Открыть помощника отдельно</a
          >
          <h3>Предпросмотр сохранённых настроек</h3>
          <iframe
            ref="preview"
            :key="`${current.id}-${saved.revision}`"
            class="widget-preview"
            :src="paths.public(`/embed/${current.id}`)"
            title="Предпросмотр внешнего помощника"
          ></iframe
        ></template>
        <p v-else class="muted">
          Предпросмотр появится после публикации и открытия библиотеки.
        </p>
      </section>
    </div>
  </div>
</template>
