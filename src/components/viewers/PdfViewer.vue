<script setup lang="ts">
import {
  ref,
  shallowRef,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import * as pdfjs from "pdfjs-dist";
import {
  EventBus,
  PDFViewer,
  PDFLinkService,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import Icon from "../Icon.vue";
import PdfThumbnail from "./PdfThumbnail.vue";
import { loadViewPosition, saveViewPosition } from "../../lib/view-position";

pdfjs.GlobalWorkerOptions.workerSrc = worker;
const props = defineProps<{ src: string; positionKey: string }>();
const container = ref<HTMLDivElement>();
const pagesElement = ref<HTMLDivElement>();
const pdf = shallowRef<pdfjs.PDFDocumentProxy>();
const pageNumber = ref(1);
const pages = ref(0);
const zoom = ref(1);
const error = ref("");
const busy = ref(false);
const pageListOpen = ref(false);
const pageNavigationMode = ref<"list" | "thumbnails">("list");
let viewer: PDFViewer | undefined;
let links: PDFLinkService | undefined;
let task: pdfjs.PDFDocumentLoadingTask | undefined;
let resize: ResizeObserver | undefined;
let generation = 0;
let ready = false;
let baseScale = 1;
let lastWidth = 0;
let bus: EventBus;

function save() {
  if (ready) saveViewPosition(props.positionKey, pageNumber.value, zoom.value);
}
function fit() {
  if (!viewer || !pdf.value || !container.value?.clientWidth) return;
  const page = pageNumber.value;
  viewer.currentScaleValue = "page-width";
  baseScale = viewer.currentScale;
  viewer.currentScale = baseScale * zoom.value;
  viewer.scrollPageIntoView({ pageNumber: page });
}
function go(value: number) {
  if (!viewer || !ready) return;
  viewer.scrollPageIntoView({
    pageNumber: Math.max(1, Math.min(pages.value, Math.floor(value) || 1)),
  });
}
async function load() {
  const gen = ++generation;
  ready = false;
  error.value = "";
  busy.value = true;
  pdf.value = undefined;
  pages.value = 0;
  viewer?.setDocument(null as unknown as pdfjs.PDFDocumentProxy);
  links?.setDocument(null);
  await task?.destroy();
  if (gen !== generation) return;
  const assets = new URL(`/pdfjs/${pdfjs.version}/`, window.location.href).href;
  task = pdfjs.getDocument({
    url: props.src,
    isEvalSupported: false,
    useSystemFonts: true,
    wasmUrl: assets + "wasm/",
    cMapUrl: assets + "cmaps/",
    cMapPacked: true,
    standardFontDataUrl: assets + "standard_fonts/",
  });
  try {
    const document = await task.promise;
    if (gen !== generation) {
      await document.destroy();
      return;
    }
    pdf.value = document;
    pages.value = document.numPages;
    links!.setDocument(document);
    viewer!.setDocument(document);
  } catch (cause) {
    if (gen === generation) {
      error.value = (cause as Error).message;
      busy.value = false;
    }
  }
}
onMounted(() => {
  bus = new EventBus();
  links = new PDFLinkService({
    eventBus: bus,
    externalLinkTarget: 2,
    externalLinkRel: "noopener noreferrer",
  });
  viewer = new PDFViewer({
    container: container.value!,
    viewer: pagesElement.value!,
    eventBus: bus,
    linkService: links,
    annotationMode: pdfjs.AnnotationMode.ENABLE,
    maxCanvasPixels: 12 * 1024 * 1024,
  });
  links.setViewer(viewer);
  bus.on("pagesinit", () => {
    if (!pdf.value) return;
    const saved = loadViewPosition(props.positionKey, pages.value);
    pageNumber.value = saved.page;
    zoom.value = saved.zoom;
    fit();
    ready = true;
    busy.value = false;
  });
  bus.on("pagechanging", ({ pageNumber: page }: { pageNumber: number }) => {
    if (!ready) return;
    pageNumber.value = page;
    save();
  });
  bus.on("pagerendered", ({ error: cause }: { error?: Error }) => {
    if (cause) error.value = cause.message;
  });
  resize = new ResizeObserver(() => {
    const width = container.value?.clientWidth || 0;
    if (width && Math.abs(width - lastWidth) > 1) {
      lastWidth = width;
      if (ready) fit();
    }
  });
  resize.observe(container.value!);
  void load();
});
watch(
  () => [props.src, props.positionKey],
  () => {
    if (viewer) void load();
  },
);
watch(zoom, () => {
  if (ready && viewer) {
    viewer.currentScale = baseScale * zoom.value;
    save();
  }
});
watch(pageListOpen, async () => {
  await nextTick();
  if (ready) fit();
});
onBeforeUnmount(() => {
  generation++;
  ready = false;
  resize?.disconnect();
  viewer?.setDocument(null as unknown as pdfjs.PDFDocumentProxy);
  void task?.destroy();
});
</script>
<template>
  <div class="pdf-controls">
    <button
      class="button small"
      aria-label="Страницы PDF"
      :aria-expanded="pageListOpen"
      @click="pageListOpen = !pageListOpen"
    >
      <Icon name="collections" :size="15" />Страницы
    </button>
    <button
      class="icon-button"
      aria-label="Предыдущая страница"
      :disabled="pageNumber <= 1"
      @click="go(pageNumber - 1)"
    >
      <Icon name="left" />
    </button>
    <input
      :value="pageNumber"
      type="number"
      min="1"
      :max="pages"
      aria-label="Номер страницы"
      @change="go(Number(($event.target as HTMLInputElement).value))"
      @keydown.enter="go(Number(($event.target as HTMLInputElement).value))"
    />
    <span>из {{ pages }}</span>
    <button
      class="icon-button"
      aria-label="Следующая страница"
      :disabled="pageNumber >= pages"
      @click="go(pageNumber + 1)"
    >
      <Icon name="right" />
    </button>
    <button
      class="button small"
      aria-label="Уменьшить PDF"
      :disabled="zoom <= 0.5"
      @click="zoom = Math.max(0.5, zoom - 0.25)"
    >
      −
    </button>
    <span>{{ Math.round(zoom * 100) }}%</span>
    <button
      class="button small"
      aria-label="Увеличить PDF"
      :disabled="zoom >= 3"
      @click="zoom = Math.min(3, zoom + 0.25)"
    >
      +
    </button>
    <span v-if="busy" class="muted" role="status">Загрузка…</span>
  </div>
  <div v-if="error" class="notice danger" role="alert">
    Не удалось отобразить PDF: {{ error }}
  </div>
  <div class="pdf-workspace" :class="{ 'pdf-with-pages': pageListOpen }">
    <aside
      v-if="pageListOpen"
      class="pdf-page-list"
      :class="{ 'pdf-thumbnails': pageNavigationMode === 'thumbnails' }"
      aria-label="Страницы PDF"
    >
      <div class="pdf-sidebar-modes" aria-label="Вид навигации PDF">
        <button
          :aria-pressed="pageNavigationMode === 'list'"
          @click="pageNavigationMode = 'list'"
        >
          Список
        </button>
        <button
          :aria-pressed="pageNavigationMode === 'thumbnails'"
          @click="pageNavigationMode = 'thumbnails'"
        >
          Миниатюры
        </button>
      </div>
      <template v-if="pdf"
        ><button
          v-for="page in pages"
          :key="page"
          :aria-label="`Перейти к странице ${page}`"
          :aria-current="pageNumber === page ? 'page' : undefined"
          @click="go(page)"
        >
          <PdfThumbnail
            v-if="pageNavigationMode === 'thumbnails' && pdf"
            :document="pdf"
            :page="page"
          /><span>{{
            pageNavigationMode === "thumbnails" ? page : `Страница ${page}`
          }}</span>
        </button></template
      >
    </aside>
    <div class="pdf-page-area">
      <div
        ref="container"
        class="pdf-canvas-stage"
        tabindex="0"
        aria-label="Страницы документа"
      >
        <div ref="pagesElement" class="pdfViewer"></div>
      </div>
    </div>
  </div>
</template>
