<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from "vue";
import type { PresentationScene } from "../../../vendor/shared/presentation";
import SlideCanvas from "./SlideCanvas.vue";
import Icon from "../Icon.vue";
import { loadViewPosition, saveViewPosition } from "../../lib/view-position";
const props = defineProps<{
  src: string;
  positionKey: string;
  startPage?: number;
}>();
const scene = ref<PresentationScene>();
const index = ref(0);
const zoom = ref(1);
const error = ref("");
const controlsError = ref("");
const showThumbnails = ref(false);
const root = ref<HTMLElement>();
const fullscreen = ref(false);
const slide = computed(() => scene.value?.slides[index.value]);
let controller: AbortController | undefined;
let ready = false;
watch(
  () => [props.src, props.positionKey] as const,
  async ([src]) => {
    controller?.abort();
    const request = (controller = new AbortController());
    ready = false;
    scene.value = undefined;
    error.value = "";
    try {
      const r = await fetch(src, { signal: request.signal });
      if (!r.ok) throw new Error("Слайды недоступны");
      const data = (await r.json()) as PresentationScene;
      if (request.signal.aborted) return;
      if (!data.slides.length) throw new Error("В презентации нет слайдов");
      const saved = loadViewPosition(props.positionKey, data.slides.length);
      index.value =
        props.startPage !== undefined
          ? Math.max(0, Math.min(data.slides.length - 1, props.startPage - 1))
          : saved.page - 1;
      zoom.value = saved.zoom;
      scene.value = data;
      ready = true;
    } catch (e) {
      if (!request.signal.aborted) error.value = (e as Error).message;
    }
  },
  { immediate: true },
);
watch(
  [index, zoom],
  () => {
    if (ready) saveViewPosition(props.positionKey, index.value + 1, zoom.value);
  },
  { flush: "sync" },
);
watch(
  () => props.startPage,
  (value) => {
    if (value !== undefined && ready) go(value);
  },
);
function go(page: number) {
  index.value = Math.min(
    (scene.value?.slides.length || 1) - 1,
    Math.max(0, (Math.floor(page) || 1) - 1),
  );
}
function keydown(event: KeyboardEvent) {
  if ((event.target as HTMLElement).closest("input,textarea,button")) return;
  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    go(
      event.key === "Home"
        ? 1
        : event.key === "End"
          ? scene.value!.slides.length
          : index.value + (event.key === "ArrowRight" ? 2 : 0),
    );
  }
}
async function toggleFullscreen() {
  controlsError.value = "";
  try {
    if (document.fullscreenElement === root.value)
      await document.exitFullscreen();
    else if (root.value?.requestFullscreen)
      await root.value.requestFullscreen();
    else throw new Error("Полный экран недоступен в этом браузере");
  } catch (e) {
    controlsError.value = (e as Error).message;
  }
}
function updateFullscreen() {
  fullscreen.value = document.fullscreenElement === root.value;
}
document.addEventListener("fullscreenchange", updateFullscreen);
onBeforeUnmount(() => {
  controller?.abort();
  document.removeEventListener("fullscreenchange", updateFullscreen);
});
</script>
<template>
  <div v-if="error" class="notice danger">{{ error }}</div>
  <div
    v-if="scene && slide"
    ref="root"
    class="slides-viewer"
    tabindex="0"
    aria-label="Просмотр презентации"
    @keydown="keydown"
  >
    <div class="slides-controls">
      <button
        class="icon-button"
        aria-label="Предыдущий слайд"
        :disabled="!index"
        @click="go(index)"
      >
        <Icon name="left" />
      </button>
      <input
        :value="index + 1"
        type="number"
        min="1"
        :max="scene.slides.length"
        aria-label="Номер слайда"
        @change="go(Number(($event.target as HTMLInputElement).value))"
      />
      <span class="small-text">из {{ scene.slides.length }}</span>
      <button
        class="icon-button"
        aria-label="Следующий слайд"
        :disabled="index >= scene.slides.length - 1"
        @click="go(index + 2)"
      >
        <Icon name="right" />
      </button>
      <button
        class="button small"
        aria-label="Уменьшить слайды"
        :disabled="zoom <= 0.5"
        @click="zoom = Math.max(0.5, zoom - 0.25)"
      >
        −
      </button>
      <span class="small-text">{{ Math.round(zoom * 100) }}%</span>
      <button
        class="button small"
        aria-label="Увеличить слайды"
        :disabled="zoom >= 3"
        @click="zoom = Math.min(3, zoom + 0.25)"
      >
        +
      </button>
      <button
        class="button small"
        aria-label="Миниатюры слайдов"
        :aria-expanded="showThumbnails"
        @click="showThumbnails = !showThumbnails"
      >
        <Icon name="collections" :size="15" />Миниатюры
      </button>
      <button
        class="button small"
        :aria-label="fullscreen ? 'Выйти из полного экрана' : 'Полный экран'"
        @click="toggleFullscreen"
      >
        <Icon name="external" :size="15" />{{
          fullscreen ? "Свернуть" : "Полный экран"
        }}
      </button>
    </div>
    <div class="slides-viewport">
      <div
        class="slides-stage"
        :style="{
          aspectRatio: `${scene.width}/${scene.height}`,
          width: `${zoom * 100}%`,
        }"
      >
        <SlideCanvas
          :scene="scene"
          :slide="slide"
          role="img"
          :aria-label="`Слайд ${index + 1}`"
        />
      </div>
    </div>
    <div
      v-if="showThumbnails"
      class="slides-thumbnails"
      aria-label="Список слайдов"
    >
      <button
        v-for="(item, i) in scene.slides"
        :key="item.id"
        :aria-label="`Перейти к слайду ${i + 1}`"
        :aria-current="i === index ? 'true' : undefined"
        @click="go(i + 1)"
      >
        <SlideCanvas
          :scene="scene"
          :slide="item"
          aria-hidden="true"
          :style="{ aspectRatio: `${scene.width}/${scene.height}` }"
        />
        <span>{{ i + 1 }}</span>
      </button>
    </div>
    <div v-if="controlsError" class="notice danger">{{ controlsError }}</div>
    <div class="notice compact viewer-warning">
      Статические слайды. Сложные объекты и анимация могут отличаться от
      PowerPoint.
    </div>
  </div>
</template>
