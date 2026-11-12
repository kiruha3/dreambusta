<script setup lang="ts">
import { paths } from "../lib/paths";
import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, kindNames, session } from "../api";
import { searchOpen, searchSeed } from "../composables/search";
import { withContext } from "../lib/navigation";
import { openAssistant } from "../composables/assistant";
import type { Collection } from "../../shared/types";
import type {
  SearchResponse,
  SearchQuery,
  SearchResult,
} from "../../shared/search";
import Icon from "./Icon.vue";
const route = useRoute();
const router = useRouter();
const dialog = ref<HTMLDialogElement>();
const input = ref<HTMLInputElement>();
const query = ref("");
const kind = ref("");
const scope = ref("");
const collections = ref<Collection[]>([]);
const response = ref<SearchResponse>();
const busy = ref(false);
const error = ref("");
const selected = ref(0);
let generation = 0;
let timer: ReturnType<typeof setTimeout>;
let controller: AbortController | undefined;
let previousFocus: HTMLElement | null = null;
const currentMaterial = computed(() =>
  route.name === "material" ? String(route.params.slug || "") : "",
);
function params(offset = 0) {
  const p = new URLSearchParams({
    q: query.value.trim(),
    offset: String(offset),
  });
  if (kind.value) p.set("kind", kind.value);
  if (scope.value === "current" && currentMaterial.value)
    p.set("material", currentMaterial.value);
  if (scope.value.startsWith("collection:"))
    p.set("collection", scope.value.slice(11));
  return p;
}
function cancel() {
  generation++;
  clearTimeout(timer);
  controller?.abort();
  busy.value = false;
}
function close() {
  cancel();
  searchOpen.value = false;
  dialog.value?.close();
  nextTick(() => previousFocus?.isConnected && previousFocus.focus());
}
async function search(append = false) {
  controller?.abort();
  const request = ++generation;
  controller = new AbortController();
  busy.value = true;
  error.value = "";
  try {
    const result = await api<SearchResponse>(
      "/search?" + params(append ? response.value?.results.length || 0 : 0),
      { signal: controller.signal },
    );
    if (request !== generation || !searchOpen.value) return;
    response.value =
      append && response.value
        ? { ...result, results: [...response.value.results, ...result.results] }
        : result;
    selected.value = 0;
  } catch (e) {
    if (request === generation && !controller.signal.aborted)
      error.value = (e as Error).message;
  } finally {
    if (request === generation) busy.value = false;
  }
}
function changed() {
  cancel();
  response.value = undefined;
  error.value = "";
  selected.value = 0;
  if (!searchOpen.value || !query.value.trim()) return;
  busy.value = true;
  timer = setTimeout(() => void search(), 250);
}
watch([query, kind, scope], changed);
watch(searchOpen, async (open) => {
  if (!open) {
    dialog.value?.close();
    cancel();
    return;
  }
  previousFocus = document.activeElement as HTMLElement;
  if (searchSeed.value !== undefined) query.value = searchSeed.value;
  response.value = undefined;
  error.value = "";
  await nextTick();
  dialog.value?.showModal();
  input.value?.focus();
  try {
    collections.value = await api<Collection[]>("/collections");
  } catch {
    collections.value = [];
  }
  if (query.value.trim()) void search();
});
watch(
  () => [session.editor, session.closed],
  () => {
    cancel();
    response.value = undefined;
    if (searchOpen.value) void search();
  },
);
function ask() {
  if (busy.value || !query.value.trim()) return;
  const options: SearchQuery = { query: query.value.trim() };
  if (kind.value) options.kind = kind.value as SearchQuery["kind"];
  if (scope.value === "current" && currentMaterial.value)
    options.material = currentMaterial.value;
  if (scope.value.startsWith("collection:"))
    options.collection = scope.value.slice(11);
  close();
  openAssistant(options);
}
async function choose(result: SearchResult) {
  close();
  await router.push(
    withContext(
      paths.internal(result.url),
      scope.value.startsWith("collection:")
        ? { from: "collection", collection: scope.value.slice(11) }
        : route.query,
    ),
  );
}
function key(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (searchOpen.value) input.value?.focus();
    else searchOpen.value = true;
  }
}
function navigate(event: KeyboardEvent) {
  if (event.isComposing) return;
  const results = response.value?.results || [];
  if (event.key === "Enter" && results.length && !busy.value) {
    event.preventDefault();
    void choose(results[selected.value] || results[0]);
  }
  if (["ArrowDown", "ArrowUp"].includes(event.key) && results.length) {
    event.preventDefault();
    selected.value =
      (selected.value + (event.key === "ArrowDown" ? 1 : -1) + results.length) %
      results.length;
    void nextTick(() =>
      dialog.value
        ?.querySelector(`[id="search-hit-${selected.value}"]`)
        ?.scrollIntoView({ block: "nearest" }),
    );
  }
}
function highlights(text: string) {
  const terms = query.value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  if (!terms.length) return [{ text, match: false }];
  const pattern = new RegExp(
    "(" +
      [...new Set(terms)].sort((a, b) => b.length - a.length).join("|") +
      ")",
    "giu",
  );
  return text
    .split(pattern)
    .filter(Boolean)
    .map((part) => ({
      text: part,
      match: terms.some((t) => part.toLocaleLowerCase() === t),
    }));
}
onMounted(() => document.addEventListener("keydown", key));
onBeforeUnmount(() => {
  cancel();
  document.removeEventListener("keydown", key);
});
</script>
<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="library-search-dialog"
      aria-labelledby="library-search-title"
      @cancel.prevent="close"
      @click="
        (e) => {
          if (e.target === dialog) close();
        }
      "
    >
      <div class="library-search-shell">
        <div class="library-search-head">
          <h2 id="library-search-title">Поиск по библиотеке</h2>
          <button class="icon-button" aria-label="Закрыть поиск" @click="close">
            <Icon name="close" />
          </button>
        </div>
        <div class="library-search-input">
          <Icon name="search" :size="22" /><input
            ref="input"
            v-model="query"
            maxlength="300"
            role="combobox"
            aria-label="Поисковый запрос"
            aria-autocomplete="list"
            aria-controls="library-search-results"
            :aria-expanded="!!response?.results.length"
            :aria-activedescendant="
              response?.results.length ? `search-hit-${selected}` : undefined
            "
            placeholder="Что найти в книгах и документах?"
            @keydown="navigate"
          /><button
            v-if="query"
            class="icon-button"
            aria-label="Очистить запрос"
            @click="
              query = '';
              input?.focus();
            "
          >
            <Icon name="close" :size="16" />
          </button>
        </div>
        <div class="library-search-filters">
          <label
            >Тип<select v-model="kind" aria-label="Тип материала">
              <option value="">Все материалы</option>
              <option
                v-for="(label, value) in kindNames"
                :key="value"
                :value="value"
              >
                {{ label }}
              </option>
            </select></label
          >
          <label
            >Область<select v-model="scope" aria-label="Область поиска">
              <option value="">Вся библиотека</option>
              <option v-if="currentMaterial" value="current">
                Текущий материал
              </option>
              <option
                v-for="c in collections"
                :key="c.id"
                :value="'collection:' + c.slug"
              >
                {{ c.title }}
              </option>
            </select></label
          >
        </div>
        <div class="library-search-body" :aria-busy="busy">
          <div v-if="!query.trim()" class="library-search-empty">
            <Icon name="search" :size="32" />
            <p>Найдите нужный фрагмент</p>
            <span
              >Поиск по названиям и содержимому книг, документов, статей и
              расшифровок.</span
            >
          </div>
          <div v-else-if="error" class="notice danger" role="alert">
            {{ error
            }}<button class="button small" @click="search()">
              Повторить поиск
            </button>
          </div>
          <div
            v-else-if="busy && !response"
            class="library-search-empty"
            role="status"
          >
            Ищем по материалам…
          </div>
          <template v-else-if="response">
            <div class="library-search-summary">
              <span role="status">Найдено фрагментов: {{ response.total }}</span
              ><span class="muted small-text"
                >{{
                  response.mode === "hybrid"
                    ? "По словам и смыслу"
                    : "По словам"
                }}{{ response.indexing ? " · Индекс готовится" : "" }}</span
              >
            </div>
            <div v-if="response.results.length" class="library-search-ai">
              <button class="button" :disabled="busy" @click="ask">
                Спросить помощника</button
              ><span class="muted small-text"
                >Ответ со ссылками на материалы</span
              >
            </div>
            <div v-if="!response.results.length" class="library-search-empty">
              <p>Ничего не найдено</p>
              <span>Попробуйте другие слова или измените область поиска.</span>
            </div>
            <div
              id="library-search-results"
              role="listbox"
              aria-label="Результаты поиска"
            >
              <button
                v-for="(result, i) in response.results"
                :id="`search-hit-${i}`"
                :key="result.id"
                role="option"
                :aria-selected="selected === i"
                class="library-search-result"
                :class="{ selected: selected === i }"
                @mouseenter="selected = i"
                @click="choose(result)"
              >
                <Icon :name="result.kind" :size="19" />
                <span class="library-result-copy"
                  ><strong>{{ result.title }}</strong
                  ><span class="library-result-context">{{
                    result.context
                  }}</span
                  ><span class="library-result-snippet"
                    ><template
                      v-for="(part, j) in highlights(result.snippet)"
                      :key="j"
                      ><mark v-if="part.match">{{ part.text }}</mark
                      ><template v-else>{{ part.text }}</template></template
                    ></span
                  ></span
                >
              </button>
            </div>
            <button
              v-if="response.results.length < response.total"
              class="button library-search-more"
              :disabled="busy"
              @click="search(true)"
            >
              {{ busy ? "Загружаем…" : "Показать ещё" }}
            </button>
          </template>
        </div>
        <div class="library-search-foot">
          <span>↑ ↓ выбрать · Enter открыть</span><span>Esc закрыть</span>
        </div>
      </div>
    </dialog>
  </Teleport>
</template>
