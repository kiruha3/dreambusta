<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Material } from "../../shared/types";
import {
  api,
  session,
  modeNames,
  kindNames,
  fileUrl,
  date,
  notify,
} from "../api";
import Icon from "../components/Icon.vue";
import Reader from "../components/Reader.vue";
const PdfViewer = defineAsyncComponent(
  () => import("../components/viewers/PdfViewer.vue"),
);
const DocxViewer = defineAsyncComponent(
  () => import("../components/viewers/DocxViewer.vue"),
);
const SlidesViewer = defineAsyncComponent(
  () => import("../components/viewers/SlidesViewer.vue"),
);
const MediaViewer = defineAsyncComponent(
  () => import("../components/viewers/MediaViewer.vue"),
);
const route = useRoute();
const router = useRouter();
const m = ref<Material>();
const error = ref("");
const mode = ref("");
const favorite = ref(false);
function favorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem("dreambusta-favorites") || "[]");
  } catch {
    return [];
  }
}
(async () => {
  try {
    const loaded = await api<Material>(`/materials/${route.params.slug}`);
    m.value = loaded;
    favorite.value = favorites().includes(loaded.id);
    if (route.params.slug !== loaded.slug) {
      await router.replace(`/library/${loaded.slug}`);
      return;
    }
    let saved = "";
    try {
      saved = localStorage.getItem(`dreambusta-mode:${loaded.id}`) || "";
    } catch {}
    const modes = loaded.representations.includes("text")
      ? [...loaded.representations, "speed"]
      : loaded.representations;
    mode.value = modes.includes(saved as any)
      ? saved
      : modes.includes("text")
        ? "text"
        : modes[0] || "";
  } catch (e) {
    error.value = (e as Error).message;
  }
})();
const modes = computed(() =>
  m.value
    ? [
        ...m.value.representations,
        ...(m.value.representations.includes("text") ? ["speed"] : []),
      ]
    : [],
);
const articleHtml = computed(
  () =>
    m.value?.html.replace(/snapshot:([a-z0-9-]+)/g, (_match, key) =>
      fileUrl(m.value!.id, key),
    ) || "",
);
watch(mode, (value) => {
  if (m.value) {
    try {
      localStorage.setItem(`dreambusta-mode:${m.value.id}`, value);
    } catch {}
  }
});
function toggleFavorite() {
  if (!m.value) return;
  const list = favorites();
  favorite.value = !favorite.value;
  try {
    localStorage.setItem(
      "dreambusta-favorites",
      JSON.stringify(
        favorite.value
          ? [...new Set([...list, m.value.id])]
          : list.filter((id) => id !== m.value!.id),
      ),
    );
  } catch {
    notify("Браузер не разрешает сохранить избранное");
  }
}
async function copy() {
  try {
    await navigator.clipboard.writeText(location.href);
    notify("Ссылка скопирована");
  } catch {
    notify("Ссылка: " + location.href);
  }
}
</script>
<template>
  <RouterLink class="back-link" to="/library"
    ><Icon name="back" />Все материалы</RouterLink
  >
  <div v-if="error" class="empty panel">
    <h1>{{ error }}</h1>
    <p>Проверьте адрес или обратитесь к редактору библиотеки.</p>
  </div>
  <template v-if="m"
    ><div class="material-header">
      <div>
        <div class="eyebrow">
          {{ kindNames[m.kind] }} <span v-if="!m.visible">· СКРЫТ</span>
        </div>
        <h1>{{ m.title }}</h1>
        <span class="muted small-text">{{
          m.author ||
          (m.wordCount
            ? `${m.wordCount.toLocaleString("ru")} слов · ${Math.max(1, Math.ceil(m.wordCount / 200))} мин чтения`
            : "Просмотр материала")
        }}</span>
      </div>
      <div class="row">
        <button
          class="icon-button"
          :aria-label="
            favorite ? 'Убрать из избранного' : 'Добавить в избранное'
          "
          @click="toggleFavorite"
        >
          <Icon
            name="heart"
            :style="{ fill: favorite ? 'currentColor' : 'none' }"
          /></button
        ><button
          class="icon-button"
          aria-label="Скопировать ссылку"
          @click="copy"
        >
          <Icon name="link" /></button
        ><RouterLink
          v-if="session.editor"
          :to="`/admin/materials/${m.id}`"
          class="button small"
          ><Icon name="edit" :size="15" />Изменить</RouterLink
        >
      </div>
    </div>
    <div
      v-if="m.source.type === 'share' && m.source.status !== 'removed'"
      class="notice"
    >
      <Icon name="info" /><span
        ><strong>Сохранённая версия · {{ date(m.source.savedAt) }}</strong> ·
        Открывается без проверки источника.<template
          v-if="
            m.source.status === 'unavailable' || m.source.status === 'error'
          "
        >
          Последнее обновление не выполнено; сохранённая версия
          доступна.</template
        ></span
      >
    </div>
    <div class="material-workspace">
      <section class="viewer-panel">
        <div v-if="modes.length" class="viewer-toolbar">
          <div class="tabs" role="group" aria-label="Режим просмотра">
            <button
              v-for="r in modes"
              :key="r"
              :class="{ active: mode === r }"
              @click="mode = r"
            >
              {{ modeNames[r] }}
            </button>
          </div>
          <span class="muted small-text">{{
            mode === "speed" ? "Читалка WBook" : "DreamBusta"
          }}</span>
        </div>
        <Reader
          v-if="mode === 'text' || mode === 'speed'"
          :paragraphs="m.paragraphs"
          :material-id="m.id"
          :text-version="m.textVersion"
          :speed-mode="mode === 'speed'"
        />
        <article
          v-else-if="mode === 'article'"
          class="reading-article"
          v-html="articleHtml"
        ></article>
        <PdfViewer
          v-else-if="mode === 'pdf'"
          :src="fileUrl(m.id, 'pdf')"
          :position-key="`dreambusta-view:${m.id}:${m.textVersion}:pdf`"
        />
        <DocxViewer
          v-else-if="mode === 'docx'"
          :src="fileUrl(m.id, 'docx')"
          :title="m.title"
        />
        <SlidesViewer
          v-else-if="mode === 'slides'"
          :src="fileUrl(m.id, 'slides')"
          :position-key="`dreambusta-view:${m.id}:${m.textVersion}:slides`"
        />
        <MediaViewer
          v-else-if="mode === 'video' || mode === 'audio'"
          :src="m.mediaUrl || fileUrl(m.id)"
          :kind="m.kind"
          :provider="m.source.provider"
          :source-url="m.source.url"
        />
        <div v-else class="empty">
          <Icon name="info" :size="38" />
          <h2>
            {{
              m.source.status === "removed"
                ? "Публикация недоступна"
                : m.state === "error"
                  ? "Не удалось обработать файл"
                  : "Нет доступных представлений"
            }}
          </h2>
          <p>
            {{
              m.error ||
              "Редактор может загрузить новую версию или обновить источник."
            }}
          </p>
        </div>
      </section>
      <aside class="material-info">
        <section class="panel">
          <h3>О материале</h3>
          <p class="muted small-text" style="line-height: 1.8">
            {{ m.description || "Описание пока не добавлено." }}
          </p>
          <div class="meta-pair"><small>Тип</small>{{ kindNames[m.kind] }}</div>
          <div class="meta-pair">
            <small>Добавлен</small>{{ date(m.createdAt) }}
          </div>
          <div v-if="m.source.provider" class="meta-pair">
            <small>Источник</small>{{ m.source.provider }}
          </div>
          <div v-if="m.tags.length" class="row wrap">
            <span v-for="tag in m.tags" :key="tag" class="badge">{{
              tag
            }}</span>
          </div>
          <a
            v-if="m.downloadable && m.files.original"
            class="button full"
            style="margin-top: 22px"
            :href="fileUrl(m.id)"
            download
            ><Icon name="download" :size="15" />Скачать оригинал</a
          ><a
            v-if="m.source.url"
            class="button full"
            style="margin-top: 12px"
            :href="m.source.url"
            target="_blank"
            rel="noopener noreferrer"
            ><Icon name="external" :size="15" />Открыть источник</a
          >
        </section>
        <div v-if="!m.representations.includes('text')" class="notice">
          <Icon name="info" /><span
            >Текстовый слой или расшифровка отсутствуют. Доступен просмотр
            материала.</span
          >
        </div>
        <div v-for="w in m.warnings" :key="w" class="notice compact">
          {{ w }}
        </div>
      </aside>
    </div></template
  >
</template>
