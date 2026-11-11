<script setup lang="ts">
import { computed, ref, watch, useId } from "vue";
import type { BookChapter } from "../../shared/types";
import { normalizeChapters, resolveChapters } from "../../lib/chapters";
import Icon from "./Icon.vue";
const props = defineProps<{
  paragraphs: string[];
  chapters?: BookChapter[];
  paragraph: number;
  storageKey: string;
}>();
const emit = defineEmits<{
  change: [chapters: BookChapter[], enabled: boolean];
  select: [paragraph: number];
}>();
type Settings = { enabled: boolean; method: "auto" | "marker"; marker: string };
const settings = ref<Settings>({
  enabled: true,
  method: "auto",
  marker: "Глава",
});
const settingsOpen = ref(false),
  tocOpen = ref(false),
  search = ref(""),
  limit = ref(150);
const draftMethod = ref<"auto" | "marker">("auto"),
  draftMarker = ref("Глава");
const preview = ref<BookChapter[]>();
const storageWarning = ref("");
const radioName = useId();
watch(
  () => props.storageKey,
  () => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(props.storageKey) || "null",
      );
      settings.value = {
        enabled: saved?.enabled !== false,
        method: saved?.method === "marker" ? "marker" : "auto",
        marker:
          typeof saved?.marker === "string"
            ? saved.marker.slice(0, 80)
            : "Глава",
      };
    } catch {
      settings.value = { enabled: true, method: "auto", marker: "Глава" };
    }
    settingsOpen.value = false;
    tocOpen.value = false;
  },
  { immediate: true },
);
watch(
  settings,
  () => {
    try {
      localStorage.setItem(props.storageKey, JSON.stringify(settings.value));
      storageWarning.value = "";
    } catch {
      storageWarning.value = "Браузер не разрешает сохранить настройки глав.";
    }
  },
  { deep: true },
);
const chapters = computed(() =>
  resolveChapters(
    props.paragraphs,
    props.chapters,
    settings.value.method === "marker" ? settings.value.marker : undefined,
  ),
);
watch(
  [chapters, () => settings.value.enabled],
  ([value, enabled]) => emit("change", value, enabled),
  { immediate: true },
);
const current = computed(() => {
  let lo = 0,
    hi = chapters.value.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (chapters.value[mid].paragraph <= props.paragraph) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo - 1);
});
const matches = computed(() =>
  chapters.value.filter((c) =>
    c.title
      .toLocaleLowerCase()
      .includes(search.value.trim().toLocaleLowerCase()),
  ),
);
const source = computed(() =>
  settings.value.method === "marker"
    ? "Своя разбивка"
    : normalizeChapters(props.chapters, props.paragraphs.length).length
      ? "Оглавление из EPUB"
      : "По заголовкам",
);
watch(search, () => (limit.value = 150));
watch([draftMethod, draftMarker], () => (preview.value = undefined));
function select(paragraph: number) {
  emit("select", paragraph);
  tocOpen.value = false;
  search.value = "";
}
function step(delta: number) {
  const chapter = chapters.value[current.value + delta];
  if (chapter) select(chapter.paragraph);
}
function configure() {
  settingsOpen.value = !settingsOpen.value;
  draftMethod.value = settings.value.method;
  draftMarker.value = settings.value.marker;
  preview.value = undefined;
}
function find() {
  preview.value = resolveChapters(
    props.paragraphs,
    props.chapters,
    draftMethod.value === "marker" ? draftMarker.value : undefined,
  );
}
function apply() {
  if (!preview.value?.length) return;
  settings.value = {
    enabled: true,
    method: draftMethod.value,
    marker: draftMarker.value.trim(),
  };
  settingsOpen.value = false;
  tocOpen.value = false;
}
function clear() {
  settings.value = { enabled: false, method: "auto", marker: "Глава" };
  settingsOpen.value = false;
  tocOpen.value = false;
  preview.value = undefined;
}
</script>
<template>
  <section class="chapter-controls" aria-label="Чтение по главам">
    <div class="chapter-toolbar">
      <label class="chapter-checkbox"
        ><input
          v-model="settings.enabled"
          type="checkbox"
          :disabled="!chapters.length"
        />Читать по главам</label
      >
      <span class="muted chapter-source">{{ source }}</span>
      <button
        class="button small"
        :aria-expanded="settingsOpen"
        aria-label="Настроить главы"
        @click="configure"
      >
        <Icon name="settings" :size="14" />Настроить
      </button>
    </div>
    <div v-if="!chapters.length" class="chapter-empty muted">
      Главы не найдены. Можно задать начало заголовка в настройках.
    </div>
    <template v-if="settings.enabled && chapters.length">
      <div class="chapter-navigation">
        <button
          class="icon-button"
          aria-label="Предыдущая глава"
          :disabled="current === 0"
          @click="step(-1)"
        >
          <Icon name="left" />
        </button>
        <div class="chapter-current">
          <strong>{{ chapters[current]?.title }}</strong
          ><small class="muted"
            >Раздел {{ current + 1 }} из {{ chapters.length }}</small
          >
        </div>
        <button
          class="icon-button"
          aria-label="Следующая глава"
          :disabled="current === chapters.length - 1"
          @click="step(1)"
        >
          <Icon name="right" />
        </button>
        <button
          class="button small"
          :aria-expanded="tocOpen"
          @click="tocOpen = !tocOpen"
        >
          <Icon name="book" :size="14" />Оглавление
        </button>
      </div>
      <div v-if="tocOpen" class="chapter-toc">
        <input
          v-model="search"
          type="search"
          aria-label="Поиск глав"
          placeholder="Найти главу по названию или номеру"
        />
        <div class="chapter-list" aria-label="Главы книги">
          <button
            v-for="chapter in matches.slice(0, limit)"
            :key="chapter.paragraph"
            :aria-current="
              chapter.paragraph === chapters[current]?.paragraph
                ? 'location'
                : undefined
            "
            @click="select(chapter.paragraph)"
          >
            {{ chapter.title }}
          </button>
          <p v-if="!matches.length" class="muted">Ничего не найдено.</p>
          <button v-if="matches.length > limit" @click="limit += 150">
            Показать ещё · {{ matches.length - limit }}
          </button>
        </div>
      </div>
    </template>
    <div v-if="settingsOpen" class="chapter-settings">
      <fieldset>
        <legend>Как определить главы</legend>
        <label
          ><input
            v-model="draftMethod"
            type="radio"
            :name="radioName"
            value="auto"
          />Автоматически</label
        >
        <label
          ><input
            v-model="draftMethod"
            type="radio"
            :name="radioName"
            value="marker"
          />По началу заголовка</label
        >
      </fieldset>
      <label v-if="draftMethod === 'marker'" class="chapter-marker"
        >Начало заголовка<input
          v-model="draftMarker"
          maxlength="80"
          placeholder="Например: Глава, Урок, Часть"
      /></label>
      <p class="muted">
        Ищем отдельные короткие заголовки. Совпадение внутри обычного абзаца не
        делит книгу.
      </p>
      <button
        class="button small"
        :disabled="draftMethod === 'marker' && !draftMarker.trim()"
        @click="find"
      >
        Найти главы
      </button>
      <div v-if="preview" class="chapter-preview" role="status">
        <p>
          {{
            preview.length
              ? `Найдено разделов: ${preview.length}`
              : "Главы не найдены. Попробуйте другое начало заголовка."
          }}
        </p>
        <ol v-if="preview.length">
          <li v-for="chapter in preview.slice(0, 8)" :key="chapter.paragraph">
            {{ chapter.title }}
          </li>
        </ol>
        <small v-if="preview.length > 8" class="muted"
          >И ещё {{ preview.length - 8 }}. Все будут доступны в
          оглавлении.</small
        >
      </div>
      <div class="chapter-settings-actions">
        <button
          class="button small primary"
          :disabled="!preview?.length"
          @click="apply"
        >
          Применить разбивку</button
        ><button class="button small" @click="clear">Убрать разбивку</button
        ><button class="button small" @click="settingsOpen = false">
          Отмена
        </button>
      </div>
    </div>
    <small v-if="storageWarning" class="muted">{{ storageWarning }}</small>
  </section>
</template>
