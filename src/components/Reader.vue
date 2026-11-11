<script setup lang="ts">
import {
  computed,
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import {
  tokenize,
  splitFocus,
  restoreProgress,
  speedForDrag,
  wordDelay,
  remainingWordTime,
  fitFocusFont,
} from "../../lib/reader";
import Icon from "./Icon.vue";
import BookText from "./BookText.vue";
import ChapterControls from "./ChapterControls.vue";
import { wordChapters, chapterAt } from "../../lib/chapters";
import type { BookChapter } from "../../shared/types";
const props = defineProps<{
  paragraphs: string[];
  materialId: string;
  textVersion: number;
  speedMode: boolean;
  chapters?: BookChapter[];
  startParagraph?: number;
  startOffset?: number;
  searchQuery?: string;
}>();
const tokens = computed(() => tokenize(props.paragraphs));
const index = ref(0);
const speed = ref(300);
const playing = ref(false);
const completed = ref(false);
const chapterCompleted = ref(false);
const chapterList = ref<BookChapter[]>([]);
const chaptersEnabled = ref(false);
const ranges = computed(() => wordChapters(chapterList.value, tokens.value));
const activeChapter = computed(
  () => ranges.value[chapterAt(ranges.value, index.value)],
);
const chapterMode = computed(
  () => props.speedMode && chaptersEnabled.value && !!activeChapter.value,
);
const contextTokens = computed(() =>
  chapterMode.value
    ? tokens.value.slice(activeChapter.value.start, activeChapter.value.end)
    : tokens.value,
);
const readingEnd = computed(() =>
  chapterMode.value ? activeChapter.value.end : tokens.value.length,
);
const warning = ref("");
const fontSize = ref(18);
const search = ref("");
const textBox = ref<InstanceType<typeof BookText>>();
const stage = ref<HTMLElement>();
const wordFont = ref(48);
const current = computed(() => tokens.value[index.value]);
const focus = computed(() => splitFocus(current.value?.text || ""));
const percent = computed(() =>
  tokens.value.length
    ? Math.round(
        ((index.value + (completed.value ? 1 : 0)) / tokens.value.length) * 100,
      )
    : 0,
);
const key = computed(
  () => `dreambusta-progress:${props.materialId}:${props.textVersion}`,
);
let timer: ReturnType<typeof setTimeout> | undefined;
let startedAt: number | null = null;
let pointer: { id: number; y: number; speed: number } | undefined;
let observer: ResizeObserver | undefined;
function save() {
  try {
    localStorage.setItem(
      key.value,
      JSON.stringify({
        index: index.value,
        speed: speed.value,
        completed: completed.value,
      }),
    );
  } catch {
    warning.value = "Браузер не разрешает сохранить место чтения.";
  }
}
function stop() {
  clearTimeout(timer);
  timer = undefined;
  startedAt = null;
  playing.value = false;
  pointer = undefined;
  save();
}
function duration() {
  return wordDelay(
    current.value?.text || "",
    speed.value,
    tokens.value[index.value + 1]?.paragraph !== current.value?.paragraph,
  );
}
function schedule() {
  if (!playing.value) return;
  const now = performance.now();
  if (startedAt === null) startedAt = now;
  clearTimeout(timer);
  timer = setTimeout(
    () => {
      if (index.value >= readingEnd.value - 1) {
        completed.value = index.value >= tokens.value.length - 1;
        chapterCompleted.value = chapterMode.value;
        stop();
        return;
      }
      index.value++;
      startedAt = performance.now();
      schedule();
    },
    remainingWordTime(duration(), startedAt, now),
  );
}
function start() {
  if (!tokens.value.length) return;
  if (completed.value || chapterCompleted.value) {
    index.value = chapterMode.value ? activeChapter.value.start : 0;
    completed.value = false;
    chapterCompleted.value = false;
  }
  playing.value = true;
  schedule();
}
function toggle() {
  if (playing.value) stop();
  else start();
}
function seek(to: number) {
  stop();
  index.value = Math.max(0, Math.min(tokens.value.length - 1, Math.floor(to)));
  completed.value = false;
  chapterCompleted.value = false;
  save();
  if (props.speedMode) void nextTick(currentPlace);
}
function changeChapters(chapters: BookChapter[], enabled: boolean) {
  stop();
  chapterCompleted.value = false;
  chapterList.value = chapters;
  chaptersEnabled.value = enabled;
  void nextTick(currentPlace);
}
function selectChapter(paragraph: number) {
  const range = ranges.value.find((c) => c.paragraph === paragraph);
  if (range) seek(range.start);
}
watch(speed, () => {
  save();
  schedule();
});
watch(index, () => {
  save();
  void nextTick(fit);
});
watch(
  () => props.speedMode,
  () => {
    stop();
    void nextTick(() => {
      fit();
      attachResize();
      currentPlace();
    });
  },
);
watch(
  key,
  () => {
    clearTimeout(timer);
    playing.value = false;
    startedAt = null;
    pointer = undefined;
    chapterCompleted.value = false;
    try {
      const raw = localStorage.getItem(key.value);
      const p = restoreProgress(raw, tokens.value.length);
      index.value = p.index;
      speed.value = p.speed;
      completed.value = JSON.parse(raw || "{}").completed === true;
    } catch {
      index.value = 0;
      speed.value = 300;
    }
  },
  { immediate: true },
);
watch(
  () => [
    props.startParagraph,
    props.startOffset,
    props.searchQuery,
    props.textVersion,
  ],
  () => {
    if (
      props.startParagraph === undefined ||
      props.startParagraph >= props.paragraphs.length
    )
      return;
    const paragraph = props.paragraphs[props.startParagraph];
    const offset = props.startOffset || 0;
    const words = [...paragraph.matchAll(/\S+/gu)];
    const wordOffset = Math.max(
      0,
      words.findIndex((word) => word.index + word[0].length > offset),
    );
    const first = tokens.value.findIndex(
      (t) => t.paragraph === props.startParagraph,
    );
    if (first >= 0) {
      seek(Math.min(first + wordOffset, tokens.value.length - 1));
      search.value = props.searchQuery || "";
      void nextTick(() => textBox.value?.follow());
    }
  },
  { immediate: true },
);
function fit() {
  if (!stage.value) return;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return;
  context.font = "500 48px Geist";
  const f = focus.value;
  wordFont.value = fitFocusFont(
    Math.max(30, stage.value.clientWidth - 40),
    context.measureText(f.before).width,
    context.measureText(f.focus).width,
    context.measureText(f.after).width,
    48,
    48,
  );
}
function attachResize() {
  observer?.disconnect();
  if (stage.value) {
    observer = new ResizeObserver(fit);
    observer.observe(stage.value);
  }
}
function down(e: PointerEvent) {
  if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
  e.preventDefault();
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  pointer = { id: e.pointerId, y: e.clientY, speed: speed.value };
  start();
}
function move(e: PointerEvent) {
  if (pointer?.id === e.pointerId)
    speed.value = speedForDrag(pointer.speed, e.clientY - pointer.y);
}
function keyboard(e: KeyboardEvent) {
  if (
    !props.speedMode ||
    e.ctrlKey ||
    e.altKey ||
    e.metaKey ||
    (e.target as HTMLElement).closest(
      "input,textarea,select,button,[contenteditable]",
    )
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    toggle();
  } else if (e.key === "Escape") stop();
  else if (e.key === "ArrowRight") {
    e.preventDefault();
    seek(index.value + 10);
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    seek(index.value - 10);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    speed.value = Math.min(1200, speed.value + 25);
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    speed.value = Math.max(60, speed.value - 25);
  }
}
function hidden() {
  if (document.hidden) stop();
}
function currentPlace() {
  textBox.value?.follow();
}
onMounted(() => {
  document.addEventListener("keydown", keyboard);
  document.addEventListener("visibilitychange", hidden);
  window.addEventListener("pagehide", stop);
  attachResize();
  void document.fonts.ready.then(fit);
});
onBeforeUnmount(() => {
  stop();
  observer?.disconnect();
  document.removeEventListener("keydown", keyboard);
  document.removeEventListener("visibilitychange", hidden);
  window.removeEventListener("pagehide", stop);
});
</script>
<template>
  <div class="reader-layout" :class="{ 'speed-reading': speedMode }">
    <div v-if="warning" class="notice warning">{{ warning }}</div>
    <ChapterControls
      v-if="speedMode"
      :paragraphs="paragraphs"
      :chapters="chapters"
      :paragraph="current?.paragraph || 0"
      :storage-key="`dreambusta-chapters:${materialId}:${textVersion}`"
      @change="changeChapters"
      @select="selectChapter"
    />
    <template v-if="speedMode"
      ><div
        ref="stage"
        class="focus-stage"
        tabindex="0"
        aria-label="Удерживайте для чтения; двигайте вверх быстрее, вниз медленнее"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="stop"
        @pointercancel="stop"
        @lostpointercapture="stop"
        @contextmenu.prevent
      >
        <div class="focus-guides"></div>
        <div class="focus-word" :style="{ fontSize: wordFont + 'px' }">
          <span class="focus-before">{{ focus.before }}</span
          ><em>{{ focus.focus }}</em
          ><span class="focus-after">{{ focus.after }}</span>
        </div>
        <div class="focus-hint">
          {{
            chapterCompleted
              ? "Глава прочитана. Можно перейти к следующей."
              : completed
                ? "Материал прочитан. Можно начать заново."
                : "Удерживайте для чтения · вверх быстрее, вниз медленнее"
          }}
        </div>
      </div></template
    >
    <div class="reader-controls" :data-index="index">
      <div v-if="speedMode" class="row speed-row">
        <button
          class="icon-button"
          aria-label="Назад на 10 слов"
          @click="seek(index - 10)"
        >
          <Icon name="left" /></button
        ><button
          class="button primary play-button"
          :aria-label="playing ? 'Пауза' : 'Начать чтение'"
          @click="toggle"
        >
          <Icon :name="playing ? 'pause' : 'play'" :size="20" /></button
        ><button
          class="icon-button"
          aria-label="Вперёд на 10 слов"
          @click="seek(index + 10)"
        >
          <Icon name="right" /></button
        ><input
          v-model.number="speed"
          class="speed-slider"
          type="range"
          min="60"
          max="1200"
          step="5"
          aria-label="Скорость чтения"
        /><span>{{ speed }} слов/мин</span>
      </div>
      <div class="reader-progress-row">
        <span>{{ percent }}%</span
        ><input
          type="range"
          :value="index"
          min="0"
          :max="Math.max(0, tokens.length - 1)"
          aria-label="Позиция в тексте"
          @input="seek(Number(($event.target as HTMLInputElement).value))"
        /><span
          >{{ Math.min(index + 1, tokens.length).toLocaleString("ru") }} /
          {{ tokens.length.toLocaleString("ru") }}</span
        >
      </div>
      <small class="muted" style="font-size: 10px"
        >Позиция хранится в этом браузере ·
        {{
          speedMode
            ? "Пробел — старт/пауза, стрелки — позиция и скорость"
            : "Нажмите на слово, чтобы продолжить с него"
        }}</small
      >
    </div>
    <section class="reader-full-text" aria-label="Полный текст">
      <h3 v-if="speedMode" class="reader-text-heading">
        <Icon name="book" :size="16" />{{
          chapterMode ? "Текст главы" : "Полный текст"
        }}
        <small class="muted">Нажмите на слово, чтобы продолжить с него</small>
      </h3>
      <div class="text-toolbar">
        <label class="search-box"
          ><Icon name="search" :size="15" /><input
            v-model="search"
            placeholder="Поиск в тексте"
            aria-label="Поиск в тексте"
        /></label>
        <div class="row gap8">
          <button
            class="icon-button"
            aria-label="Уменьшить шрифт"
            @click="fontSize = Math.max(14, fontSize - 1)"
          >
            A−
          </button>
          <button
            class="icon-button"
            aria-label="Увеличить шрифт"
            @click="fontSize = Math.min(28, fontSize + 1)"
          >
            A+
          </button>
        </div>
        <button class="button small" @click="currentPlace">Моё место</button>
      </div>
      <BookText
        :key="chapterMode ? activeChapter.start : 'full'"
        ref="textBox"
        :tokens="contextTokens"
        :index="index"
        :font-size="fontSize"
        :search="search"
        :follow-current="speedMode && playing"
        @select="seek"
      />
    </section>
  </div>
</template>
