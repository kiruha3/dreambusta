<script setup lang="ts">
import {
  computed,
  ref,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from "vue";
import type { Token } from "../../lib/reader";
const props = defineProps<{
  tokens: Token[];
  index: number;
  fontSize: number;
  search: string;
}>();
const emit = defineEmits<{ select: [index: number] }>();
const container = ref<HTMLElement>();
const width = ref(600);
const height = ref(500);
const top = ref(0);
const measured = ref<Record<number, number>>({});
let resize: ResizeObserver;
let rowsResize: ResizeObserver;
const rows = computed(() => {
  const list: { words: Token[]; paragraph: number; start: number }[] = [];
  for (const token of props.tokens) {
    const row = list[list.length - 1];
    if (!row || row.paragraph !== token.paragraph || row.words.length >= 90)
      list.push({
        words: [token],
        paragraph: token.paragraph,
        start: token.index,
      });
    else row.words.push(token);
  }
  return list;
});
const offsets = computed(() => {
  const charsPerLine = Math.max(
    15,
    (width.value - 80) / (props.fontSize * 0.52),
  );
  const out = [0];
  rows.value.forEach((r, i) =>
    out.push(
      out[i] +
        (measured.value[i] ||
          Math.ceil(
            r.words.reduce((n, w) => n + w.text.length + 1, 0) / charsPerLine,
          ) *
            props.fontSize *
            1.9 +
            props.fontSize),
    ),
  );
  return out;
});
function rowAt(position: number) {
  let lo = 0;
  let hi = rows.value.length;
  while (lo < hi) {
    const middle = Math.floor((lo + hi) / 2);
    if (offsets.value[middle + 1] < position) lo = middle + 1;
    else hi = middle;
  }
  return lo;
}
const start = computed(() => Math.max(0, rowAt(top.value - 400)));
const end = computed(() =>
  Math.min(rows.value.length, rowAt(top.value + height.value + 600) + 1),
);
const visible = computed(() => rows.value.slice(start.value, end.value));
function measure() {
  if (!container.value || !rowsResize) return;
  rowsResize.disconnect();
  container.value
    .querySelectorAll<HTMLElement>("[data-row]")
    .forEach((el) => rowsResize.observe(el));
}
watch([start, end], () => void nextTick(measure));
watch(
  () => props.fontSize,
  () => {
    measured.value = {};
    void nextTick(measure);
  },
);
function follow() {
  const row = rows.value.findIndex(
    (r, i) =>
      props.index >= r.start &&
      (!rows.value[i + 1] || props.index < rows.value[i + 1].start),
  );
  if (row >= 0 && container.value) {
    container.value.scrollTop = Math.max(
      0,
      offsets.value[row] - container.value.clientHeight / 3,
    );
    top.value = container.value.scrollTop;
  }
}
function nextMatch() {
  if (!props.search.trim()) return;
  const terms = props.search.toLocaleLowerCase().trim().split(/\s+/);
  const matches = props.tokens.filter((t, i) =>
    terms.every((term, offset) =>
      props.tokens[i + offset]?.text.toLocaleLowerCase().includes(term),
    ),
  );
  const match = matches.find((t) => t.index > props.index) || matches[0];
  if (match) {
    emit("select", match.index);
    void nextTick(follow);
  }
}
const searchCount = computed(() =>
  props.search
    ? props.tokens.filter((t) =>
        t.text.toLocaleLowerCase().includes(props.search.toLocaleLowerCase()),
      ).length
    : 0,
);
defineExpose({ follow, nextMatch });
onMounted(() => {
  rowsResize = new ResizeObserver((entries) => {
    const values = { ...measured.value };
    let changed = false;
    for (const e of entries) {
      const row = Number((e.target as HTMLElement).dataset.row);
      const value = Math.ceil(
        e.borderBoxSize[0]?.blockSize ||
          e.target.getBoundingClientRect().height,
      );
      if (values[row] !== value) {
        values[row] = value;
        changed = true;
      }
    }
    if (changed) measured.value = values;
  });
  resize = new ResizeObserver(() => {
    if (!container.value) return;
    if (width.value !== container.value.clientWidth) {
      width.value = container.value.clientWidth;
      measured.value = {};
    }
    height.value = container.value.clientHeight;
  });
  if (container.value) resize.observe(container.value);
  measure();
  void nextTick(follow);
});
onBeforeUnmount(() => {
  resize?.disconnect();
  rowsResize?.disconnect();
});
</script>
<template>
  <div v-if="search" class="text-search-status">
    <span>{{
      searchCount
        ? `Совпадений со словом: ${searchCount}`
        : "Поиск по словам и фразам"
    }}</span
    ><button class="button small" @click="nextMatch">
      Следующее совпадение
    </button>
  </div>
  <div
    ref="container"
    class="virtual-reader reader-text"
    :style="{ fontSize: fontSize + 'px' }"
    tabindex="0"
    aria-label="Полный текст; нажмите на слово, чтобы выбрать позицию"
    @scroll="top = ($event.target as HTMLElement).scrollTop"
  >
    <div
      :style="{
        height: (offsets[offsets.length - 1] || 0) + 30 + 'px',
        position: 'relative',
      }"
    >
      <div
        class="virtual-reader-rows"
        :style="{ transform: `translateY(${offsets[start] || 0}px)` }"
      >
        <p
          v-for="(row, rowIndex) in visible"
          :key="row.start"
          :data-row="start + rowIndex"
          class="virtual-paragraph"
        >
          <template v-for="(token, i) in row.words" :key="token.index"
            ><span
              class="reading-word"
              :class="{
                'selected-word': token.index === index,
                'found-word':
                  !!search &&
                  token.text
                    .toLocaleLowerCase()
                    .includes(search.toLocaleLowerCase()),
              }"
              @click="emit('select', token.index)"
              >{{ token.text }}</span
            >{{ i < row.words.length - 1 ? " " : "" }}</template
          >
        </p>
      </div>
    </div>
  </div>
</template>
