<script setup lang="ts">
import { paths } from "../lib/paths";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { MessageCircle, Send, Square } from "lucide-vue-next";
import ChatWidgetShell from "./assistant/ChatWidgetShell.vue";
import {
  assistantOpen,
  assistantRequest,
  openAssistant,
} from "../composables/assistant";
import { searchOpen } from "../composables/search";
import { api, session } from "../api";
import type { Collection } from "../../shared/types";
import type {
  SearchAnswer,
  SearchQuery,
  SearchResult,
} from "../../shared/search";
interface Turn {
  id: number;
  question: string;
  options: SearchQuery;
  scope: string;
  pending: boolean;
  answer?: SearchAnswer;
  error?: string;
}
const route = useRoute();
const router = useRouter();
const shell = ref<InstanceType<typeof ChatWidgetShell>>();
const input = ref<HTMLTextAreaElement>();
const messages = ref<HTMLElement>();
const question = ref("");
const scope = ref("");
const collections = ref<Collection[]>([]);
const turns = ref<Turn[]>([]);
const active = ref<Turn>();
let sequence = 0;
let contextGeneration = 0;
let controller: AbortController | undefined;
const disabled = computed(() => session.closed && !session.editor);
const currentMaterial = computed(() =>
  route.name === "material" ? String(route.params.slug || "") : "",
);
const selectedScope = computed(() =>
  scope.value === "current"
    ? "Текущий материал"
    : scope.value.startsWith("material:")
      ? "Материал из поиска"
      : collections.value.find((c) => "collection:" + c.slug === scope.value)
          ?.title || "Вся библиотека",
);
const handoffKind = ref<SearchQuery["kind"]>();
const handoffMaterial = ref("");
function cancel() {
  controller?.abort();
  controller = undefined;
  if (active.value) {
    active.value.pending = false;
    active.value.error = "Ответ остановлен. Можно повторить вопрос.";
  }
  active.value = undefined;
}
function close() {
  contextGeneration++;
  cancel();
  assistantOpen.value = false;
  void nextTick(() => shell.value?.focusLauncher());
}
function fresh() {
  contextGeneration++;
  assistantRequest.value = undefined;
  cancel();
  turns.value = [];
  question.value = "";
  void nextTick(() => input.value?.focus());
}
async function bottom() {
  await nextTick();
  if (messages.value) messages.value.scrollTop = messages.value.scrollHeight;
}
async function request(turn: Turn) {
  cancel();
  turn.pending = true;
  turn.error = undefined;
  turn.answer = undefined;
  active.value = turn;
  const local = new AbortController();
  controller = local;
  void bottom();
  try {
    const answer = await api<SearchAnswer>("/search/answer", {
      method: "POST",
      body: JSON.stringify(turn.options),
      signal: local.signal,
    });
    if (local.signal.aborted || active.value?.id !== turn.id) return;
    turn.answer = answer;
  } catch (error) {
    if (!local.signal.aborted && active.value?.id === turn.id)
      turn.error = (error as Error).message;
  } finally {
    if (active.value?.id === turn.id) {
      turn.pending = false;
      active.value = undefined;
      controller = undefined;
      void bottom();
    }
  }
}
function submit(options?: SearchQuery) {
  const text = (options?.query || question.value).trim();
  if (!text || text.length > 300 || active.value) return;
  if (!options) {
    contextGeneration++;
    assistantRequest.value = undefined;
  }
  const query: SearchQuery = options ? { ...options } : { query: text };
  if (!options) {
    if (scope.value === "current" && currentMaterial.value)
      query.material = currentMaterial.value;
    if (scope.value.startsWith("material:"))
      query.material = handoffMaterial.value;
    if (scope.value.startsWith("collection:"))
      query.collection = scope.value.slice(11);
    if (handoffKind.value) query.kind = handoffKind.value;
  }
  const turn: Turn = {
    id: ++sequence,
    question: text,
    options: query,
    scope: selectedScope.value,
    pending: true,
  };
  turns.value.push(turn);
  if (turns.value.length > 20) turns.value.shift();
  question.value = "";
  void request(turns.value.at(-1)!);
}
function enter(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submit();
  }
}
async function choose(source: SearchResult) {
  close();
  await router.push(paths.internal(source.url));
}
watch([assistantOpen, assistantRequest], async ([open, requestOptions]) => {
  const generation = ++contextGeneration;
  if (!open) return;
  await nextTick();
  if (!assistantOpen.value || generation !== contextGeneration) return;
  let found: Collection[] = [];
  try {
    found = await api<Collection[]>("/collections");
  } catch {
    /* unavailable collections do not prevent library-wide questions */
  }
  if (
    !assistantOpen.value ||
    generation !== contextGeneration ||
    requestOptions !== assistantRequest.value
  )
    return;
  collections.value = found;
  if (requestOptions) {
    cancel();
    handoffKind.value = requestOptions.kind;
    handoffMaterial.value = requestOptions.material || "";
    scope.value = requestOptions.collection
      ? "collection:" + requestOptions.collection
      : requestOptions.material
        ? "material:" + requestOptions.material
        : "";
    assistantRequest.value = undefined;
    submit(requestOptions);
  }
  void bottom();
  input.value?.focus();
});
watch(searchOpen, (open) => {
  if (open && assistantOpen.value) {
    contextGeneration++;
    cancel();
    assistantOpen.value = false;
  }
});
watch(currentMaterial, (material) => {
  if (!material && scope.value === "current") scope.value = "";
});
watch(
  () => [session.editor, session.closed, session.email],
  () => {
    contextGeneration++;
    assistantRequest.value = undefined;
    cancel();
    turns.value = [];
    question.value = "";
    collections.value = [];
    scope.value = "";
    handoffKind.value = undefined;
    handoffMaterial.value = "";
    if (disabled.value) assistantOpen.value = false;
  },
);
onBeforeUnmount(cancel);
</script>
<template>
  <ChatWidgetShell
    ref="shell"
    :is-open="assistantOpen"
    :disabled="disabled"
    @toggle="assistantOpen ? close() : openAssistant()"
    @close="close"
    @new-chat="fresh"
  >
    <div class="assistant-context">
      <label
        >Ответить по
        <select
          v-model="scope"
          aria-label="Искать ответ в"
          @change="handoffKind = undefined"
        >
          <option value="">Всей библиотеке</option>
          <option v-if="currentMaterial" value="current">
            Текущему материалу
          </option>
          <option v-if="handoffMaterial" :value="'material:' + handoffMaterial">
            Материалу из поиска
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
      <span v-if="handoffKind" class="muted small-text"
        >Тип материала из поиска
        <button @click="handoffKind = undefined">×</button></span
      >
    </div>
    <div
      ref="messages"
      class="assistant-messages"
      role="log"
      aria-label="Вопросы и ответы"
      aria-live="polite"
    >
      <div v-if="!turns.length" class="assistant-empty">
        <MessageCircle :size="30" />
        <h3>Что хотите узнать?</h3>
        <p>
          Задайте вопрос по книгам и документам. Ответ будет со ссылками на
          найденные фрагменты.
        </p>
      </div>
      <article v-for="turn in turns" :key="turn.id" class="assistant-turn">
        <p class="assistant-question">{{ turn.question }}</p>
        <small class="assistant-turn-scope">{{ turn.scope }}</small>
        <div class="assistant-response">
          <p v-if="turn.pending" role="status">Ищу и читаю источники…</p>
          <template v-else-if="turn.answer?.status === 'answered'"
            ><p class="library-answer-text">{{ turn.answer.answer }}</p>
          </template>
          <p v-else>{{ turn.error || turn.answer?.message }}</p>
          <div v-if="!turn.pending && turn.answer?.sources.length">
            <small v-if="turn.answer.status !== 'answered'" class="muted"
              >Близкие по теме материалы</small
            >
            <button
              v-for="source in turn.answer.sources"
              :key="source.number"
              class="library-source-link"
              @click="choose(source)"
            >
              [{{ source.number }}] {{ source.title }} · {{ source.context }}
            </button>
          </div>
          <button
            v-if="
              !turn.pending &&
              (turn.error ||
                turn.answer?.status === 'unavailable' ||
                turn.answer?.status === 'changed')
            "
            class="button small"
            :disabled="!!active"
            @click="request(turn)"
          >
            Повторить вопрос
          </button>
        </div>
      </article>
    </div>
    <form class="assistant-composer" @submit.prevent="submit()">
      <div class="assistant-input">
        <textarea
          ref="input"
          v-model="question"
          aria-label="Вопрос помощнику"
          placeholder="Спросите по библиотеке…"
          maxlength="300"
          rows="2"
          @keydown="enter"
        />
        <!-- Send/Stop priority adapted from TH MessageInputActions.vue. -->
        <button
          v-if="active"
          type="button"
          class="icon-button"
          aria-label="Остановить ответ"
          @click="cancel"
        >
          <Square :size="18" />
        </button>
        <button
          v-else
          type="submit"
          class="icon-button"
          aria-label="Отправить вопрос"
          :disabled="!question.trim()"
        >
          <Send :size="19" />
        </button>
      </div>
      <small>Каждый вопрос рассматривается отдельно. Enter — отправить.</small>
    </form>
  </ChatWidgetShell>
</template>
<style scoped>
.assistant-context {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}
.assistant-context label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.assistant-context select {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  font-size: 12px;
  padding: 5px 8px;
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--background);
}
.assistant-messages {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  overscroll-behavior: contain;
}
.assistant-empty {
  min-height: 180px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  gap: 12px;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.6;
}
.assistant-empty h3 {
  font-weight: 600;
  color: var(--foreground);
  font-size: 15px;
}
.assistant-turn {
  margin-bottom: 24px;
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.assistant-question {
  padding: 10px 12px;
  border-radius: 12px 12px 2px 12px;
  margin-left: 20px;
  background: var(--muted);
  white-space: pre-wrap;
}
.assistant-turn-scope {
  display: block;
  margin: 5px 0 12px;
  text-align: right;
  font-size: 10px;
  color: var(--muted-foreground);
}
.assistant-response {
  padding-right: 8px;
}
.assistant-response .button {
  margin-top: 10px;
}
.assistant-composer {
  flex-shrink: 0;
  padding: 12px;
  border-top: 1px solid var(--border);
}
.assistant-input {
  display: flex;
  align-items: flex-end;
  gap: 5px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
}
.assistant-input:focus-within {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
}
.assistant-input textarea {
  border: 0;
  outline: 0;
  background: transparent;
  flex: 1;
  min-width: 0;
  padding: 3px;
  resize: none;
  font-size: 14px;
  max-height: 120px;
}
.assistant-composer > small {
  display: block;
  margin-top: 8px;
  font-size: 10px;
  line-height: 1.4;
  color: var(--muted-foreground);
}
@media (max-width: 600px) {
  .assistant-input textarea {
    font-size: 16px;
  }
  .assistant-composer {
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }
}
</style>
