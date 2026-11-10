<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from "vue";
import * as pdfjs from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import Icon from "../Icon.vue";
import { loadViewPosition, saveViewPosition } from "../../lib/view-position";
pdfjs.GlobalWorkerOptions.workerSrc = worker;
const props = defineProps<{ src: string; positionKey: string }>();
const canvas = ref<HTMLCanvasElement>();
const stage = ref<HTMLElement>();
const pageNumber = ref(1);
const pages = ref(0);
const zoom = ref(1);
const error = ref("");
const busy = ref(false);
let pdf: pdfjs.PDFDocumentProxy | undefined;
let task: pdfjs.PDFDocumentLoadingTask | undefined;
let render: pdfjs.RenderTask | undefined;
let generation = 0;
let drawing = 0;
let ready = false;
async function paint() {
  const gen = ++drawing;
  const previous = render;
  render = undefined;
  previous?.cancel();
  await previous?.promise.catch(() => {});
  if (gen !== drawing) return;
  if (!pdf || !canvas.value) return;
  const doc = pdf;
  busy.value = true;
  try {
    const page = await doc.getPage(pageNumber.value);
    if (gen !== drawing || doc !== pdf || !canvas.value) return;
    const natural = page.getViewport({ scale: 1 });
    const fit = Math.min(
      1.5,
      Math.max(0.25, ((stage.value?.clientWidth || 700) - 40) / natural.width),
    );
    const scale = fit * zoom.value;
    const viewport = page.getViewport({ scale });
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const c = canvas.value;
    c.width = Math.floor(viewport.width * ratio);
    c.height = Math.floor(viewport.height * ratio);
    c.style.width = viewport.width + "px";
    c.style.height = viewport.height + "px";
    render = page.render({
      canvas: c,
      canvasContext: c.getContext("2d")!,
      viewport,
      transform: [ratio, 0, 0, ratio, 0, 0],
    });
    await render.promise;
  } catch (e) {
    if ((e as Error).name !== "RenderingCancelledException" && gen === drawing)
      error.value = (e as Error).message;
  } finally {
    if (gen === drawing) busy.value = false;
  }
}
watch(
  () => [props.src, props.positionKey] as const,
  async ([src]) => {
    const gen = ++generation;
    ready = false;
    ++drawing;
    render?.cancel();
    await task?.destroy();
    pdf = undefined;
    pages.value = 0;
    error.value = "";
    busy.value = true;
    if (gen !== generation) return;
    task = pdfjs.getDocument({
      url: src,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    try {
      const doc = await task.promise;
      if (gen !== generation) {
        await doc.destroy();
        return;
      }
      pdf = doc;
      pages.value = doc.numPages;
      const saved = loadViewPosition(props.positionKey, doc.numPages);
      pageNumber.value = saved.page;
      zoom.value = saved.zoom;
      await nextTick();
      if (gen !== generation) return;
      ready = true;
      await paint();
    } catch (e) {
      if (gen === generation) {
        error.value = (e as Error).message;
        busy.value = false;
      }
    }
  },
  { immediate: true },
);
watch(
  [pageNumber, zoom],
  () => {
    if (!ready) return;
    saveViewPosition(props.positionKey, pageNumber.value, zoom.value);
    void paint();
  },
  { flush: "sync" },
);
function go(n: number) {
  pageNumber.value = Math.min(pages.value, Math.max(1, Math.floor(n) || 1));
}
onBeforeUnmount(() => {
  ready = false;
  generation++;
  drawing++;
  render?.cancel();
  void task?.destroy();
});
</script>
<template>
  <div class="pdf-controls">
    <button
      class="icon-button"
      aria-label="Предыдущая страница"
      :disabled="pageNumber <= 1"
      @click="go(pageNumber - 1)"
    >
      <Icon name="left" /></button
    ><input
      :value="pageNumber"
      type="number"
      min="1"
      :max="pages"
      aria-label="Номер страницы"
      @change="go(Number(($event.target as HTMLInputElement).value))"
    /><span>из {{ pages }}</span
    ><button
      class="icon-button"
      aria-label="Следующая страница"
      :disabled="pageNumber >= pages"
      @click="go(pageNumber + 1)"
    >
      <Icon name="right" /></button
    ><button
      class="button small"
      aria-label="Уменьшить PDF"
      @click="zoom = Math.max(0.5, zoom - 0.25)"
    >
      −</button
    ><span>{{ Math.round(zoom * 100) }}%</span
    ><button
      class="button small"
      aria-label="Увеличить PDF"
      @click="zoom = Math.min(3, zoom + 0.25)"
    >
      +</button
    ><span v-if="busy" class="muted">Загрузка…</span>
  </div>
  <div v-if="error" class="notice danger" role="alert">
    Не удалось отобразить PDF: {{ error }}
  </div>
  <div ref="stage" class="pdf-canvas-stage">
    <canvas ref="canvas" aria-label="Страница PDF"></canvas>
  </div>
</template>
