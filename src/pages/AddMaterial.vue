<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { send, uploadFile, notify } from "../api";
import Icon from "../components/Icon.vue";
const router = useRouter();
const mode = ref("file");
const input = ref<HTMLInputElement>();
const busy = ref(false);
const error = ref("");
const progress = ref(0);
const filename = ref("");
const url = ref("");
const title = ref("");
const markdown = ref("");
const provider = ref("");
async function upload(files?: FileList | File[] | null) {
  if (!files?.length || busy.value) return;
  busy.value = true;
  error.value = "";
  let last;
  try {
    for (const file of Array.from(files)) {
      filename.value = file.name;
      progress.value = 0;
      last = await uploadFile(file, (n) => (progress.value = n));
      if (last.state === "error") {
        await router.push(`/admin/materials/${last.id}`);
        return;
      }
    }
    notify("Материалы добавлены");
    if (last) await router.push(`/admin/materials/${last.id}`);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
function drop(e: DragEvent) {
  e.preventDefault();
  void upload(e.dataTransfer?.files);
}
async function preview() {
  error.value = "";
  try {
    const d = await send("/links/preview", "POST", { url: url.value });
    provider.value =
      d.provider === "buildin"
        ? "Buildin · сохранённая статья"
        : d.provider === "techhelper"
          ? "TechHelper · опубликованный материал"
          : `${d.provider} · ${d.kind === "audio" ? "аудио" : "видео"}`;
  } catch (e) {
    error.value = (e as Error).message;
    provider.value = "";
  }
}
async function addLink() {
  busy.value = true;
  error.value = "";
  try {
    const m = await send("/links", "POST", {
      url: url.value,
      title: title.value,
    });
    notify("Материал добавлен");
    await router.push(`/admin/materials/${m.id}`);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function article() {
  if (!title.value.trim() || !markdown.value.trim()) return;
  await upload([
    new File(
      [markdown.value],
      `${title.value.replace(/[/\\\x00-\x1f]/g, "-")}.md`,
      { type: "text/markdown" },
    ),
  ]);
}
</script>
<template>
  <RouterLink class="back-link" to="/admin/materials"
    ><Icon name="back" />Материалы</RouterLink
  >
  <div class="page-heading">
    <div>
      <div class="eyebrow">ПОПОЛНЕНИЕ БИБЛИОТЕКИ</div>
      <h1>Добавить материал</h1>
      <p>Загрузите файл, подключите публикацию или создайте статью.</p>
    </div>
  </div>
  <div class="tabs add-tabs">
    <button
      v-for="(label, key) in {
        file: 'Загрузить файл',
        link: 'По ссылке',
        article: 'Статья Markdown',
      }"
      :key="key"
      :class="{ active: mode === key }"
      :disabled="busy"
      @click="
        mode = key;
        error = '';
      "
    >
      {{ label }}
    </button>
  </div>
  <div class="form-columns">
    <section class="panel stack">
      <template v-if="mode === 'file'"
        ><h2>Загрузка файла</h2>
        <input
          ref="input"
          type="file"
          multiple
          class="sr-only"
          aria-label="Выбрать файлы"
          accept=".md,.markdown,.txt,.doc,.docx,.pdf,.pptx,.epub,.fb2,.zip,.mobi,.azw3,.mp4,.webm,.mov,.m4v,.mp3,.m4a,.ogg,.oga,.wav,.flac"
          :disabled="busy"
          @change="upload(($event.target as HTMLInputElement).files)"
        /><button
          class="dropzone"
          :disabled="busy"
          @dragover.prevent
          @drop="drop"
          @click="input?.click()"
        >
          <Icon name="upload" :size="35" /><strong>{{
            busy ? filename : "Перетащите файлы сюда"
          }}</strong
          ><span class="muted">{{
            busy
              ? progress < 100
                ? `Загрузка ${progress}%`
                : "Файл загружен. Обрабатываем содержимое…"
              : "или нажмите, чтобы выбрать на компьютере"
          }}</span
          ><span v-if="!busy" class="button">Выбрать файлы</span
          ><progress v-else max="100" :value="progress"></progress>
        </button>
        <p class="muted small-text">
          Книги — до 25 МБ; PPTX — 32 МБ; PDF и Word — 100 МБ; видео и аудио — 1
          ГБ.
        </p></template
      >
      <form v-if="mode === 'link'" class="stack" @submit.prevent="addLink">
        <h2>Подключить по ссылке</h2>
        <label class="field"
          >Ссылка на материал<input
            v-model="url"
            type="url"
            required
            placeholder="https://…"
            @blur="url && preview()"
        /></label>
        <div v-if="provider" class="notice success">
          <Icon name="check" />{{ provider }}
        </div>
        <label class="field"
          >Название <span class="muted">(можно заполнить после добавления)</span
          ><input
            v-model="title"
            maxlength="300"
            placeholder="Название материала"
        /></label>
        <div class="notice">
          <Icon name="info" /><span
            >Публикации TechHelper и Buildin сохраняются для повторного чтения.
            Видео воспроизводится из источника и требует сети.</span
          >
        </div>
        <button class="button primary" :disabled="busy">
          {{ busy ? "Получаем материал…" : "Добавить в библиотеку" }}
        </button>
      </form>
      <form v-if="mode === 'article'" class="stack" @submit.prevent="article">
        <h2>Новая статья</h2>
        <label class="field"
          >Название<input v-model="title" required maxlength="200" /></label
        ><label class="field"
          >Содержимое Markdown<textarea
            v-model="markdown"
            rows="15"
            required
            placeholder="# Заголовок&#10;&#10;Текст статьи…"
          ></textarea></label
        ><button class="button primary" :disabled="busy">
          {{ busy ? "Сохраняем…" : "Создать статью" }}
        </button>
      </form>
      <div v-if="error" class="notice danger" role="alert">{{ error }}</div>
    </section>
    <aside class="stack">
      <div class="panel">
        <h3>Что можно добавить</h3>
        <ul class="format-list">
          <li>
            <Icon name="document" /><span
              >Документы<small>MD, TXT, PDF, DOCX, DOC*</small></span
            >
          </li>
          <li>
            <Icon name="book" /><span
              >Электронные книги<small
                >EPUB, FB2, FB2.ZIP, MOBI, AZW3</small
              ></span
            >
          </li>
          <li>
            <Icon name="presentation" /><span
              >Презентации<small>PPTX · статические слайды</small></span
            >
          </li>
          <li>
            <Icon name="video" /><span
              >Видео и подкасты<small
                >Файлы и ссылки YouTube, Rutube, VK</small
              ></span
            >
          </li>
          <li>
            <Icon name="link" /><span
              >Публикации<small>TechHelper / DreamAgent, Buildin</small></span
            >
          </li>
        </ul>
        <small class="muted"
          >* Для старого DOC на сервере нужен LibreOffice. DRM-книги не
          поддерживаются.</small
        >
      </div>
      <div class="notice">
        <Icon name="info" /><span
          >После загрузки можно изменить название, адрес, обложку, описание и
          видимость.</span
        >
      </div>
    </aside>
  </div>
</template>
