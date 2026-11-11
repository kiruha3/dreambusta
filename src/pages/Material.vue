<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Material, PublicationNode } from "../../shared/types";
import {
  api,
  session,
  modeNames,
  kindNames,
  fileUrl,
  date,
  notify,
  send,
} from "../api";
import Icon from "../components/Icon.vue";
import Reader from "../components/Reader.vue";
import PublicationTree from "../components/PublicationTree.vue";
import PublicationIcon from "../components/PublicationIcon.vue";
import { searchNumber } from "../lib/search-location";
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
const treeOpen = ref(!window.matchMedia("(max-width: 800px)").matches);
const refreshing = ref(false);
const refreshError = ref("");
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
      await router.replace({
        path: `/library/${loaded.slug}`,
        query: route.query,
        hash: route.hash,
      });
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
      : modes.includes("article")
        ? "article"
        : modes.includes("text")
          ? "text"
          : modes[0] || "";
    applySearchMode();
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
const currentPage = computed(() =>
  m.value?.pages?.find((p) => p.slug === route.query.page),
);
const pageMissing = computed(() => !!route.query.page && !currentPage.value);
const content = computed(() => currentPage.value || m.value);
const staleSearch = computed(
  () =>
    searchNumber(route.query.version) !== undefined &&
    searchNumber(route.query.version) !== m.value?.textVersion,
);
const searchParagraph = computed(() =>
  staleSearch.value ? undefined : searchNumber(route.query.paragraph),
);
let searchLoad = 0;
watch(
  () => route.query.version,
  async (value) => {
    const version = searchNumber(value);
    if (version === undefined || !m.value || version === m.value.textVersion)
      return;
    const request = ++searchLoad;
    try {
      const fresh = await api<Material>(`/materials/${m.value.id}`);
      if (request !== searchLoad) return;
      m.value = fresh;
      applySearchMode();
    } catch (e) {
      if (request === searchLoad) {
        m.value = undefined;
        error.value = (e as Error).message;
      }
    }
  },
);
function applySearchMode() {
  const view = String(route.query.view || "");
  if (
    !staleSearch.value &&
    ["text", "pdf", "slides"].includes(view) &&
    m.value?.representations.includes(view as any)
  )
    mode.value = view;
}
watch(
  () => [
    route.query.view,
    route.query.paragraph,
    route.query.pdfPage,
    route.query.slide,
    route.query.version,
  ],
  applySearchMode,
);
const article = ref<HTMLElement>();
const pagePath = (slug?: string) =>
  `/library/${m.value!.slug}${slug ? `?page=${encodeURIComponent(slug)}` : ""}`;
const navigation = computed<PublicationNode[]>(() => {
  if (!m.value?.source.url || !m.value.pages?.length) return [];
  return m.value.navigation?.length
    ? m.value.navigation
    : [
        {
          sourceUrl: m.value.source.url,
          title: m.value.title,
          icon: m.value.icon,
        },
        ...m.value.pages.map((p) => ({
          sourceUrl: p.sourceUrl,
          parentSourceUrl: p.parentSourceUrl || m.value!.source.url,
          title: p.title,
          icon: p.icon,
        })),
      ];
});
function navigationPath(url: string) {
  return pagePath(m.value?.pages?.find((p) => p.sourceUrl === url)?.slug);
}
async function refreshBranch() {
  if (!m.value || refreshing.value) return;
  refreshing.value = true;
  refreshError.value = "";
  try {
    const saved = await send<Material>(
      `/materials/${m.value.id}/refresh`,
      "POST",
    );
    m.value = saved;
    if (saved.source.status !== "saved")
      refreshError.value =
        saved.source.message ||
        "Не удалось обновить. Сохранённая версия доступна.";
    else notify("Сохранённая ветка обновлена");
  } catch (e) {
    refreshError.value = (e as Error).message;
  } finally {
    refreshing.value = false;
  }
}
function sourceKey(value: string) {
  const url = new URL(value);
  url.hash = "";
  url.pathname = url.pathname.replace(/\/$/, "");
  url.searchParams.sort();
  return url.href;
}
const articleHtml = computed(() => {
  if (!m.value) return "";
  const html = (content.value?.html || "").replace(
    /snapshot:([a-z0-9-]+)/g,
    (_match, key) => fileUrl(m.value!.id, key),
  );
  const root = document.createElement("template");
  root.innerHTML = html;
  const paths = new Map<string, string>();
  if (m.value.source.url) {
    paths.set(sourceKey(m.value.source.url), pagePath());
    if (m.value.sourcePageId) {
      const alias = new URL(m.value.source.url);
      alias.searchParams.set("page_id", m.value.sourcePageId);
      paths.set(sourceKey(alias.href), pagePath());
    }
  }
  for (const page of m.value.pages || [])
    paths.set(sourceKey(page.sourceUrl), pagePath(page.slug));
  for (const link of root.content.querySelectorAll<HTMLAnchorElement>(
    "a[href]",
  )) {
    const href = link.getAttribute("href")!;
    if (href.startsWith("#")) {
      link.target = "_self";
      continue;
    }
    try {
      const target = new URL(href, m.value.source.url || location.href);
      const path = paths.get(sourceKey(target.href));
      if (path) {
        link.setAttribute("href", path + target.hash);
        link.target = "_self";
      }
    } catch {}
  }
  return root.innerHTML;
});
function scrollToFragment(hash: string) {
  try {
    const id = decodeURIComponent(hash.replace(/^#/, ""));
    const heading = Array.from(
      article.value?.querySelectorAll<HTMLElement>("[id]") || [],
    ).find((el) => el.id === id);
    heading?.scrollIntoView({ block: "start" });
  } catch {}
}
function articleClick(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
  if (!link || link.hasAttribute("download")) return;
  const target = new URL(link.href);
  if (
    target.origin !== location.origin ||
    target.pathname !== `/library/${m.value!.slug}`
  )
    return;
  event.preventDefault();
  if (target.hash && target.search === location.search) {
    // Let the router own history while scrolling inside this article only.
    void router
      .push(target.pathname + target.search + target.hash)
      .then(() => scrollToFragment(target.hash));
  } else void router.push(target.pathname + target.search + target.hash);
}
watch(
  () => [route.query.page, route.hash],
  async () => {
    await nextTick();
    if (route.hash && mode.value === "article") scrollToFragment(route.hash);
    else if (currentPage.value || !route.query.page)
      article.value?.scrollIntoView({ block: "start" });
  },
  { flush: "post" },
);
watch([articleHtml, mode], async () => {
  await nextTick();
  if (route.hash && mode.value === "article") scrollToFragment(route.hash);
});
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
  <div v-if="m && staleSearch" class="notice" role="status">
    Материал обновлён. Место из старого результата поиска может отличаться.
  </div>
  <template v-if="m"
    ><div class="material-header">
      <div>
        <div class="eyebrow">
          {{ kindNames[m.kind] }} <span v-if="!m.visible">· СКРЫТ</span>
        </div>
        <h1>{{ currentPage?.title || m.title }}</h1>
        <span class="muted small-text">{{
          m.author ||
          (content?.wordCount
            ? `${content.wordCount.toLocaleString("ru")} слов · ${Math.max(1, Math.ceil(content.wordCount / 200))} мин чтения`
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
      <button
        v-if="session.editor"
        class="button small refresh-branch"
        :disabled="refreshing"
        @click="refreshBranch"
      >
        {{ refreshing ? "Обновляем…" : "Обновить ветку" }}
      </button>
    </div>
    <div v-if="refreshError" class="notice danger" role="alert">
      {{ refreshError }}
    </div>
    <div
      class="material-workspace"
      :class="{ 'with-publication-tree': navigation.length }"
    >
      <aside v-if="navigation.length" class="publication-sidebar">
        <button
          class="publication-tree-toggle"
          aria-label="Страницы публикации"
          :aria-expanded="treeOpen"
          aria-controls="publication-tree"
          @click="treeOpen = !treeOpen"
        >
          Страницы публикации <span>{{ m.pages!.length + 1 }}</span>
        </button>
        <nav
          id="publication-tree"
          :class="{ collapsed: !treeOpen }"
          aria-label="Дерево публикации"
        >
          <h3>Страницы публикации</h3>
          <PublicationTree
            :nodes="navigation"
            :current-url="
              currentPage?.sourceUrl || (!pageMissing ? m.source.url : '')
            "
            :href-for="navigationPath"
            :material-id="m.id"
          />
        </nav>
      </aside>
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
            mode === "speed" ? "WBook" : "DreamBusta"
          }}</span>
        </div>
        <nav
          v-if="m.pages?.length"
          class="publication-navigation"
          aria-label="Разделы публикации"
        >
          <RouterLink
            :to="pagePath()"
            :aria-current="!currentPage && !pageMissing ? 'page' : undefined"
            >{{ m.title }}</RouterLink
          >
          <label
            >Раздел
            <select
              aria-label="Раздел публикации"
              :value="currentPage?.slug || ''"
              @change="
                router.push(
                  pagePath(($event.target as HTMLSelectElement).value),
                )
              "
            >
              <option value="">Основная статья</option>
              <option v-for="p in m.pages" :key="p.slug" :value="p.slug">
                {{ p.title }}
              </option>
            </select>
          </label>
        </nav>
        <div v-if="pageMissing" class="empty">
          <h2>Раздел не найден в сохранённой версии</h2>
          <RouterLink :to="pagePath()">Вернуться к основной статье</RouterLink>
        </div>
        <Reader
          v-else-if="mode === 'text' || mode === 'speed'"
          :key="currentPage?.slug || m.id"
          :paragraphs="content!.paragraphs"
          :chapters="currentPage ? undefined : m.chapters"
          :material-id="currentPage ? `${m.id}:${currentPage.slug}` : m.id"
          :text-version="m.textVersion"
          :speed-mode="mode === 'speed'"
          :start-paragraph="searchParagraph"
          :start-offset="
            staleSearch ? undefined : searchNumber(route.query.offset)
          "
          :search-query="staleSearch ? '' : String(route.query.q || '')"
        />
        <article
          v-else-if="mode === 'article'"
          ref="article"
          class="reading-article"
          @click="articleClick"
        >
          <PublicationIcon
            :icon="content?.icon"
            :material-id="m.id"
            class="publication-cover-icon"
          />
          <div v-html="articleHtml"></div>
        </article>
        <PdfViewer
          v-else-if="mode === 'pdf'"
          :src="fileUrl(m.id, 'pdf')"
          :position-key="`dreambusta-view:${m.id}:${m.textVersion}:pdf`"
          :start-page="
            staleSearch ? undefined : searchNumber(route.query.pdfPage)
          "
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
          :start-page="
            staleSearch ? undefined : searchNumber(route.query.slide)
          "
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
