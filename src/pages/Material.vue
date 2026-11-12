<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Collection, Material, PublicationNode } from "../../shared/types";
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
import { contextQuery, withContext } from "../lib/navigation";
import { materialSection } from "../composables/navigation";
import MaterialBreadcrumbs from "../components/MaterialBreadcrumbs.vue";
import "../reading.css";
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
function readingPreference(key: string, fallback: string) {
  try {
    return localStorage.getItem(`dreambusta-reading-${key}`) || fallback;
  } catch {
    return fallback;
  }
}
const treeOpen = ref(
  readingPreference(
    "tree",
    window.matchMedia("(max-width: 800px)").matches ? "hidden" : "visible",
  ) === "visible",
);
const infoOpen = ref(readingPreference("info", "visible") === "visible");
const panelsHidden = ref(readingPreference("panels", "visible") === "hidden");
const contentsVisible = computed(() => treeOpen.value && !panelsHidden.value);
function toggleContents() {
  if (contentsVisible.value) treeOpen.value = false;
  else {
    treeOpen.value = true;
    panelsHidden.value = false;
  }
}
const workspace = ref<HTMLElement>();
const workspaceWidth = ref(1000);
const treeWidth = ref(
  Math.max(
    200,
    Math.min(420, Number(readingPreference("contents-width", "240")) || 240),
  ),
);
const treeMaxWidth = computed(() =>
  Math.max(200, Math.min(420, Math.floor(workspaceWidth.value * 0.45))),
);
const effectiveTreeWidth = computed(() =>
  Math.min(treeWidth.value, treeMaxWidth.value),
);
let workspaceResize: ResizeObserver | undefined;
let contentsDrag: { id: number; x: number; width: number } | undefined;
watch(workspace, (element) => {
  workspaceResize?.disconnect();
  if (!element) return;
  workspaceWidth.value = element.clientWidth;
  workspaceResize = new ResizeObserver(() => {
    workspaceWidth.value = element.clientWidth;
  });
  workspaceResize.observe(element);
});
watch(treeWidth, (value) => {
  try {
    localStorage.setItem("dreambusta-reading-contents-width", String(value));
  } catch {}
});
function startContentsResize(event: PointerEvent) {
  if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0))
    return;
  event.preventDefault();
  contentsDrag = {
    id: event.pointerId,
    x: event.clientX,
    width: effectiveTreeWidth.value,
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function resizeContents(event: PointerEvent) {
  if (contentsDrag?.id !== event.pointerId) return;
  treeWidth.value = Math.round(
    Math.max(
      200,
      Math.min(
        treeMaxWidth.value,
        contentsDrag.width + contentsDrag.x - event.clientX,
      ),
    ),
  );
}
function contentsKeyboard(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  treeWidth.value =
    event.key === "Home"
      ? 200
      : event.key === "End"
        ? treeMaxWidth.value
        : Math.max(
            200,
            Math.min(
              treeMaxWidth.value,
              effectiveTreeWidth.value + (event.key === "ArrowLeft" ? 20 : -20),
            ),
          );
}
const refreshing = ref(false);
const refreshError = ref("");
const parentCollection = ref<Collection>();
const verifiedContext = ref<Record<string, string>>({});
const readingWidth = ref("standard");
try {
  const width = localStorage.getItem("dreambusta-reading-width");
  if (["narrow", "standard", "wide"].includes(width || ""))
    readingWidth.value = width!;
} catch {}
watch(readingWidth, (value) => {
  try {
    localStorage.setItem("dreambusta-reading-width", value);
  } catch {}
});
watch(treeOpen, (value) => {
  try {
    localStorage.setItem(
      "dreambusta-reading-tree",
      value ? "visible" : "hidden",
    );
  } catch {}
});
watch(infoOpen, (value) => {
  try {
    localStorage.setItem(
      "dreambusta-reading-info",
      value ? "visible" : "hidden",
    );
  } catch {}
});
watch(panelsHidden, (value) => {
  try {
    localStorage.setItem(
      "dreambusta-reading-panels",
      value ? "hidden" : "visible",
    );
  } catch {}
});
function favorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem("dreambusta-favorites") || "[]");
  } catch {
    return [];
  }
}
let materialLoad = 0;
async function loadMaterial() {
  const request = ++materialLoad;
  error.value = "";
  m.value = undefined;
  try {
    const loaded = await api<Material>(`/materials/${route.params.slug}`);
    if (request !== materialLoad) return;
    m.value = loaded;
    favorite.value = favorites().includes(loaded.id);
    if (route.params.slug !== loaded.slug) {
      await router.replace({
        path: `/library/${loaded.slug}`,
        query: route.query,
        hash: route.hash,
      });
      if (request !== materialLoad) return;
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
    if (request === materialLoad) error.value = (e as Error).message;
  }
}
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
const articleHeight = ref(500);
let articleResize: ResizeObserver | undefined;
function fitArticleViewport() {
  if (!article.value || mode.value !== "article") return;
  const remaining =
    window.innerHeight -
    Math.max(0, article.value.getBoundingClientRect().top) -
    20;
  articleHeight.value = Math.max(200, Math.min(900, Math.floor(remaining)));
}
watch(article, (element) => {
  articleResize?.disconnect();
  if (!element) return;
  articleResize = new ResizeObserver(() => {
    fitArticleViewport();
    updateArticlePosition();
  });
  articleResize.observe(element);
  const body = element.querySelector("div");
  if (body) articleResize.observe(body);
  fitArticleViewport();
});
const pagePath = (slug?: string) =>
  withContext(
    `/library/${m.value!.slug}${slug ? `?page=${encodeURIComponent(slug)}` : ""}`,
    verifiedContext.value,
  );
let contextLoad = 0;
watch(
  [() => route.query.from, () => route.query.collection, () => m.value?.id],
  async () => {
    const request = ++contextLoad;
    parentCollection.value = undefined;
    verifiedContext.value = {};
    materialSection.value = "all";
    if (!m.value) return;
    const context = contextQuery(route.query);
    if (context.from === "collection") {
      const materialId = m.value.id;
      try {
        const collection = await api<Collection>(
          `/collections/${context.collection}`,
        );
        if (request !== contextLoad) return;
        if (!collection.visible || !collection.materialIds.includes(materialId))
          return;
        parentCollection.value = collection;
        verifiedContext.value = {
          from: "collection",
          collection: collection.slug,
        };
        materialSection.value = "collection";
        if (route.query.collection !== collection.slug)
          await router.replace({
            path: route.path,
            query: { ...route.query, collection: collection.slug },
            hash: route.hash,
          });
      } catch {
        /* Missing or inaccessible contexts return to the library. */
      }
    } else {
      verifiedContext.value = context;
      materialSection.value = context.from || "all";
    }
  },
  { immediate: true },
);
const ancestorPages = computed(() => {
  const ancestors = [];
  const seen = new Set<string>();
  let parent = currentPage.value?.parentSourceUrl;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const page = m.value?.pages?.find((p) => p.sourceUrl === parent);
    if (!page || page.slug === currentPage.value?.slug) break;
    ancestors.unshift(page);
    parent = page.parentSourceUrl;
  }
  return ancestors;
});
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
    if (heading && article.value) {
      const viewport = article.value;
      viewport.scrollTop +=
        heading.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top -
        viewport.clientTop -
        16;
    }
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
  // A repeated fragment does not change the route, so position it directly.
  // New fragments are handled once by the route watcher after navigation.
  if (
    target.hash &&
    target.search === location.search &&
    target.hash === route.hash
  )
    scrollToFragment(target.hash);
  void router.push(target.pathname + target.search + target.hash);
}
const articlePercent = ref(0);
const articlePositionKey = computed(() =>
  m.value
    ? `dreambusta-article:${m.value.id}:${m.value.textVersion}:${currentPage.value?.slug || "root"}`
    : "",
);
let articleReady = false;
let articleFrame = 0;
let articleRestore = 0;
function updateArticlePosition() {
  if (!articleReady || !article.value || mode.value !== "article") return;
  const offset = article.value.scrollTop;
  const remaining = article.value.scrollHeight - article.value.clientHeight;
  articlePercent.value = Math.min(
    100,
    Math.max(0, remaining > 0 ? Math.round((offset / remaining) * 100) : 0),
  );
  try {
    localStorage.setItem(
      articlePositionKey.value,
      JSON.stringify({ offset, percent: articlePercent.value }),
    );
  } catch {}
}
function articleScroll() {
  if (articleFrame) return;
  articleFrame = requestAnimationFrame(() => {
    articleFrame = 0;
    updateArticlePosition();
  });
}
watch(
  [articleHtml, mode, () => route.query.page],
  async () => {
    const request = ++articleRestore;
    articleReady = false;
    await nextTick();
    if (
      request !== articleRestore ||
      !article.value ||
      mode.value !== "article"
    )
      return;
    fitArticleViewport();
    await nextTick();
    if (request !== articleRestore || !article.value) return;
    if (route.hash) scrollToFragment(route.hash);
    else {
      try {
        const saved = JSON.parse(
          localStorage.getItem(articlePositionKey.value) || "null",
        );
        if (Number.isFinite(saved?.offset) && saved.offset > 0) {
          article.value.scrollTop = saved.offset;
        } else article.value.scrollTop = 0;
      } catch {}
    }
    articleReady = true;
    updateArticlePosition();
  },
  { flush: "post" },
);
watch(
  () => route.hash,
  async () => {
    await nextTick();
    if (mode.value === "article" && route.hash) scrollToFragment(route.hash);
  },
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
watch(() => route.params.slug, loadMaterial, { immediate: true });
onMounted(() => {
  window.addEventListener("scroll", fitArticleViewport, { passive: true });
  window.addEventListener("resize", fitArticleViewport);
});
onBeforeUnmount(() => {
  updateArticlePosition();
  materialLoad++;
  contextLoad++;
  articleRestore++;
  cancelAnimationFrame(articleFrame);
  window.removeEventListener("scroll", fitArticleViewport);
  window.removeEventListener("resize", fitArticleViewport);
  articleResize?.disconnect();
  workspaceResize?.disconnect();
  materialSection.value = "all";
});
</script>
<template>
  <div
    class="reading-page"
    :class="{
      'article-mode': mode === 'article',
      'panels-hidden': panelsHidden,
    }"
    :data-reading-width="readingWidth"
  >
    <MaterialBreadcrumbs
      v-if="m"
      :material="m"
      :collection="parentCollection"
      :context="verifiedContext"
      :page="currentPage"
      :ancestors="ancestorPages"
      :page-path="pagePath"
      :page-missing="pageMissing"
    />
    <RouterLink v-else class="back-link" to="/library"
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
      <div class="reading-controls" role="group" aria-label="Настройки чтения">
        <label v-if="['article', 'text', 'speed'].includes(mode)"
          >Ширина текста
          <select v-model="readingWidth" aria-label="Ширина текста">
            <option value="narrow">Узкая</option>
            <option value="standard">Обычная</option>
            <option value="wide">Широкая</option>
          </select>
        </label>
        <button
          class="button small"
          :aria-label="
            panelsHidden ? 'Показать боковые панели' : 'Скрыть боковые панели'
          "
          :aria-pressed="panelsHidden"
          @click="panelsHidden = !panelsHidden"
        >
          <Icon name="filters" :size="15" />{{
            panelsHidden ? "Показать панели" : "Скрыть панели"
          }}
        </button>
      </div>
      <div
        ref="workspace"
        class="material-workspace"
        :style="{ '--publication-tree-width': effectiveTreeWidth + 'px' }"
        :class="{
          'with-publication-tree': navigation.length && treeOpen,
          'with-material-info': infoOpen,
          'with-side-panel': !panelsHidden,
          'side-panel-collapsed': !infoOpen && !(navigation.length && treeOpen),
        }"
      >
        <aside
          v-if="!panelsHidden"
          class="reading-side-panel"
          aria-label="Боковая панель чтения"
        >
          <div
            class="reading-side-actions"
            role="group"
            aria-label="Боковые панели"
          >
            <button
              v-if="navigation.length"
              class="button small"
              :aria-label="
                contentsVisible ? 'Скрыть оглавление' : 'Показать оглавление'
              "
              :aria-expanded="contentsVisible"
              :title="
                contentsVisible ? 'Скрыть оглавление' : 'Показать оглавление'
              "
              aria-controls="publication-tree"
              @click="toggleContents"
            >
              <Icon name="collections" :size="15" /><span>Оглавление</span>
            </button>
            <button
              class="button small"
              aria-label="О материале"
              :aria-expanded="infoOpen"
              :title="infoOpen ? 'Скрыть сведения о материале' : 'О материале'"
              aria-controls="material-info"
              @click="infoOpen = !infoOpen"
            >
              <Icon name="info" :size="15" /><span>О материале</span>
            </button>
          </div>
          <aside
            v-if="navigation.length && treeOpen"
            class="publication-sidebar"
          >
            <nav id="publication-tree" aria-label="Дерево публикации">
              <h3>Оглавление</h3>
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
          <aside v-if="infoOpen" id="material-info" class="material-info">
            <section class="panel">
              <h3>О материале</h3>
              <p class="muted small-text">
                {{ m.description || "Описание пока не добавлено." }}
              </p>
              <div class="meta-pair">
                <small>Тип</small>{{ kindNames[m.kind] }}
              </div>
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
        </aside>
        <div
          v-if="navigation.length && treeOpen"
          class="publication-splitter"
          role="separator"
          aria-label="Ширина оглавления"
          aria-orientation="vertical"
          aria-controls="publication-tree"
          :aria-valuenow="effectiveTreeWidth"
          :aria-valuemin="200"
          :aria-valuemax="treeMaxWidth"
          :aria-valuetext="`${effectiveTreeWidth} пикселей`"
          tabindex="0"
          title="Потяните, чтобы изменить ширину оглавления; стрелки — точная настройка"
          @pointerdown="startContentsResize"
          @pointermove="resizeContents"
          @pointerup="contentsDrag = undefined"
          @pointercancel="contentsDrag = undefined"
          @lostpointercapture="contentsDrag = undefined"
          @keydown="contentsKeyboard"
        >
          <span aria-hidden="true"><Icon name="grip" :size="14" /></span>
        </div>
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
          <div
            v-if="mode === 'article' && !pageMissing"
            class="article-reading-position"
            role="status"
            aria-label="Позиция в статье"
            title="По прокрутке текущей страницы; сохраняется в этом браузере"
          >
            <progress
              :value="articlePercent"
              max="100"
              aria-label="Позиция чтения статьи"
            ></progress
            ><span>Позиция в статье: {{ articlePercent }}%</span>
          </div>
          <div v-if="pageMissing" class="empty">
            <h2>Раздел не найден в сохранённой версии</h2>
            <RouterLink :to="pagePath()"
              >Вернуться к основной статье</RouterLink
            >
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
            :style="{ height: articleHeight + 'px' }"
            tabindex="0"
            aria-label="Текст статьи"
            @scroll="articleScroll"
            @load.capture="fitArticleViewport"
            @click="articleClick"
          >
            <div class="article-content">
              <PublicationIcon
                :icon="content?.icon"
                :material-id="m.id"
                class="publication-cover-icon"
              />
              <div v-html="articleHtml"></div>
            </div>
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
      </div></template
    >
  </div>
</template>
