<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import type { AISettings, AIStatus } from "../../shared/models";
import { api, send, notify } from "../api";

const status = ref<AIStatus>();
const form = reactive<AISettings>({
  enabled: false,
  embeddingModel: "embeddinggemma:latest",
  answerModel: "gemma4:e2b",
});
const model = ref("embeddinggemma:latest");
const error = ref("");
const busy = ref(false);
const loading = ref(true);
const initialized = ref(false);
let disposed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let request: AbortController | undefined;
const downloading = computed(() => status.value?.pull?.state === "running");
const percent = computed(() => {
  const pull = status.value?.pull;
  return pull?.total
    ? Math.min(100, Math.round((pull.completed / pull.total) * 100))
    : null;
});
function size(bytes: number) {
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} ГБ`
    : `${Math.round(bytes / 1024 ** 2)} МБ`;
}
async function refresh() {
  if (disposed) return;
  request?.abort();
  const controller = new AbortController();
  request = controller;
  try {
    const data = await api<AIStatus>("/ai", { signal: controller.signal });
    if (disposed || request !== controller) return;
    status.value = data;
    if (!initialized.value) {
      Object.assign(form, data.settings);
      initialized.value = true;
    }
  } catch (e) {
    if (!disposed && !controller.signal.aborted)
      error.value = (e as Error).message;
  } finally {
    if (!disposed && request === controller) {
      loading.value = false;
      clearTimeout(timer);
      timer = setTimeout(refresh, downloading.value ? 1500 : 10000);
    }
  }
}
async function act(action: () => Promise<unknown>, message?: string) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await action();
    if (!disposed) {
      if (message) notify(message);
      await refresh();
    }
  } catch (e) {
    if (!disposed) error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function save() {
  await act(async () => {
    const saved = await send<AISettings>("/ai/settings", "PATCH", { ...form });
    Object.assign(form, saved);
  }, "Настройки моделей сохранены");
}
function remove(name: string) {
  if (
    window.confirm(
      `Удалить модель «${name}» с диска? Для повторного использования потребуется скачать её заново.`,
    )
  )
    void act(
      () => send("/ai/models", "DELETE", { model: name }),
      "Модель удалена",
    );
}
onMounted(refresh);
onUnmounted(() => {
  disposed = true;
  clearTimeout(timer);
  request?.abort();
});
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">УПРАВЛЕНИЕ</div>
      <h1>Локальные модели</h1>
      <p>Ollama, поиск по смыслу и ответы по материалам библиотеки.</p>
    </div>
    <button class="button" :disabled="busy || loading" @click="refresh">
      Обновить
    </button>
  </div>
  <div v-if="error" class="notice danger" role="alert">{{ error }}</div>
  <p v-if="loading" role="status">Проверяем Ollama…</p>
  <template v-if="status">
    <section class="panel stack">
      <h2>Ollama {{ status.online ? "доступна" : "недоступна" }}</h2>
      <p v-if="!status.online" class="notice" role="status">
        {{ status.error }} При первой установке администратор сервера должен
        установить Ollama и запустить её службу через systemd. После этого
        модели можно скачивать и выбирать здесь.
      </p>
      <p class="muted">
        Службой Ollama управляет systemd на сервере. Эта страница работает с уже
        запущенной службой по локальному адресу.
      </p>
      <p v-if="status.environmentDisabled" class="notice">
        На сервере задано DREAMBUSTA_AI=off. Поиск по смыслу и ответы отключены
        этим параметром; сохранённый выбор начнёт действовать после его удаления
        и перезапуска приложения.
      </p>
      <p role="status">
        Поиск по смыслу и ответы:
        <strong>{{ status.effectiveEnabled ? "включены" : "выключены" }}</strong
        >. Поиск по словам доступен всегда.
      </p>
    </section>
    <form class="panel stack model-section" @submit.prevent="save">
      <h2>Модели библиотеки</h2>
      <label class="check-label"
        ><input
          v-model="form.enabled"
          type="checkbox"
          :disabled="busy || status.environmentDisabled"
        />Включить поиск по смыслу и ответы</label
      >
      <div class="field">
        <label for="embedding-model">Модель для поиска по смыслу</label
        ><select
          id="embedding-model"
          v-model="form.embeddingModel"
          :disabled="busy || !status.online"
        >
          <option
            v-if="!status.installed.some((m) => m.name === form.embeddingModel)"
            :value="form.embeddingModel"
          >
            {{ form.embeddingModel }} · не установлена
          </option>
          <option
            v-for="item in status.installed"
            :key="item.name"
            :value="item.name"
          >
            {{ item.name }}
          </option>
        </select>
      </div>
      <div class="field">
        <label for="answer-model">Модель для ответов</label
        ><select
          id="answer-model"
          v-model="form.answerModel"
          :disabled="busy || !status.online"
        >
          <option
            v-if="!status.installed.some((m) => m.name === form.answerModel)"
            :value="form.answerModel"
          >
            {{ form.answerModel }} · не установлена
          </option>
          <option
            v-for="item in status.installed"
            :key="item.name"
            :value="item.name"
          >
            {{ item.name }}
          </option>
        </select>
      </div>
      <p class="muted">
        Рекомендуем embeddinggemma:latest для поиска и gemma4:e2b для ответов.
        Выбирайте модели с соответствующими возможностями. При смене модели
        поиска библиотека заново подготовит индекс; до завершения работает поиск
        по словам.
      </p>
      <button
        class="button primary self-start"
        :disabled="busy || !initialized || (form.enabled && !status.online)"
      >
        {{ busy ? "Применяем…" : "Сохранить выбор" }}
      </button>
    </form>
    <form
      class="panel stack model-section"
      @submit.prevent="act(() => send('/ai/pull', 'POST', { model }))"
    >
      <h2>Скачать модель</h2>
      <label class="field"
        >Имя модели Ollama<input
          v-model="model"
          list="suggested-models"
          maxlength="180"
          required
          :disabled="busy || downloading || !status.online"
          placeholder="embeddinggemma:latest"
      /></label>
      <datalist id="suggested-models">
        <option value="embeddinggemma:latest" />
        <option value="gemma4:e2b" />
      </datalist>
      <p class="muted">
        Загрузка идёт на сервер и может занимать несколько гигабайт. Можно
        закрыть страницу: процесс продолжится. Одновременно скачивается одна
        модель.
      </p>
      <button
        class="button self-start"
        :disabled="busy || downloading || !status.online"
      >
        Скачать
      </button>
      <div v-if="status.pull" class="stack" aria-live="polite">
        <strong>{{ status.pull.model }}</strong
        ><span>{{ status.pull.status }}</span
        ><template v-if="downloading"
          ><progress
            :value="percent ?? undefined"
            max="100"
            :aria-label="'Прогресс загрузки ' + status.pull.model"
          /><span v-if="percent !== null"
            >{{ percent }}% · {{ size(status.pull.completed) }} из
            {{ size(status.pull.total) }}</span
          ><button
            class="button self-start"
            type="button"
            :disabled="busy"
            @click="act(() => send('/ai/pull', 'DELETE'))"
          >
            Отменить загрузку
          </button></template
        >
        <p v-if="status.pull.error" class="notice danger">
          {{ status.pull.error }}
        </p>
      </div>
    </form>
    <section class="panel stack model-section">
      <h2>На диске</h2>
      <p v-if="!status.installed.length" class="muted">
        {{
          status.online
            ? "Установленных моделей пока нет."
            : "Список недоступен."
        }}
      </p>
      <ul class="model-list">
        <li v-for="item in status.installed" :key="item.name">
          <div>
            <strong>{{ item.name }}</strong>
            <p class="muted">
              {{ size(item.size)
              }}<span v-if="status.settings.embeddingModel === item.name">
                · поиск</span
              ><span v-if="status.settings.answerModel === item.name">
                · ответы</span
              >
            </p>
          </div>
          <button
            class="button small"
            :disabled="
              busy ||
              [
                status.settings.embeddingModel,
                status.settings.answerModel,
              ].includes(item.name) ||
              (downloading && status.pull?.model === item.name)
            "
            @click="remove(item.name)"
          >
            Удалить
          </button>
        </li>
      </ul>
    </section>
    <section class="panel stack model-section">
      <h2>В памяти</h2>
      <p class="muted">
        Выгрузка освобождает память. При следующем запросе выбранная модель
        загрузится снова.
      </p>
      <p v-if="!status.running.length" class="muted">
        {{
          status.online
            ? "Загруженных в память моделей нет."
            : "Список недоступен."
        }}
      </p>
      <ul class="model-list">
        <li v-for="item in status.running" :key="item.name">
          <div>
            <strong>{{ item.name }}</strong>
            <p class="muted">
              {{ size(item.size) }} · видеопамять {{ size(item.sizeVram || 0) }}
            </p>
          </div>
          <button
            class="button small"
            :disabled="busy"
            @click="
              act(
                () => send('/ai/unload', 'POST', { model: item.name }),
                'Модель выгружена из памяти',
              )
            "
          >
            Выгрузить
          </button>
        </li>
      </ul>
    </section>
  </template>
</template>
<style scoped>
.model-section {
  margin-top: 1.25rem;
}
.model-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.model-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem 0;
  border-bottom: 1px solid var(--border, #ddd);
  overflow-wrap: anywhere;
}
.model-list li > div {
  min-width: 0;
}
.model-list p {
  margin: 0.3rem 0 0;
}
progress {
  width: 100%;
}
</style>
