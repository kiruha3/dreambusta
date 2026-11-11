<script setup lang="ts">
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import { send, uploadFile, notify } from "../api";
import Icon from "../components/Icon.vue";
import PublicationTree from "../components/PublicationTree.vue";
import type { PublicationNode, ShareImportOptions } from "../../shared/types";
import { MAX_PUBLICATION_PAGES } from "../../shared/publication";
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
const share = ref(false);
const resolvedUrl = ref("");
const scope = ref<ShareImportOptions["scope"]>("branch");
const navigation = ref<PublicationNode[]>([]);
const selectedUrls = ref<string[]>([]);
const navigationBusy = ref(false);
let generation = 0;
watch(
  url,
  () => {
    generation++;
    provider.value = "";
    share.value = false;
    resolvedUrl.value = "";
    navigation.value = [];
    selectedUrls.value = [];
    scope.value = "branch";
    navigationBusy.value = false;
    error.value = "";
  },
  { flush: "sync" },
);
watch(scope, (value) => {
  if (value === "menu" && share.value) void loadNavigation();
});
function canonicalUrl() {
  if (resolvedUrl.value) return resolvedUrl.value;
  const u = new URL(url.value);
  u.hash = "";
  u.pathname = u.pathname.replace(/\/$/, "");
  return u.href;
}
async function loadNavigation() {
  if (navigation.value.length || navigationBusy.value) return;
  const request = generation;
  navigationBusy.value = true;
  error.value = "";
  try {
    const nodes = await send<PublicationNode[]>("/links/navigation", "POST", {
      url: url.value,
    });
    if (request !== generation) return;
    navigation.value = nodes;
    selectedUrls.value = [
      ...new Set([...nodes.map((n) => n.sourceUrl), canonicalUrl()]),
    ];
  } catch (e) {
    if (request === generation) error.value = (e as Error).message;
  } finally {
    if (request === generation) navigationBusy.value = false;
  }
}
function togglePage(value: string, checked: boolean) {
  selectedUrls.value = checked
    ? [...new Set([...selectedUrls.value, value])]
    : selectedUrls.value.filter((u) => u !== value);
}
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
  const request = generation;
  error.value = "";
  try {
    const d = await send("/links/preview", "POST", { url: url.value });
    if (request !== generation) return;
    share.value = d.type === "share";
    resolvedUrl.value = d.url;
    provider.value =
      d.provider === "buildin"
        ? "Buildin · сохранённая статья"
        : d.provider === "techhelper"
          ? "TechHelper · опубликованный материал"
          : `${d.provider} · ${d.kind === "audio" ? "аудио" : "видео"}`;
    if (share.value && scope.value === "menu") void loadNavigation();
  } catch (e) {
    if (request !== generation) return;
    error.value = (e as Error).message;
    provider.value = "";
  }
}
async function addLink() {
  if (busy.value) return;
  if (
    navigationBusy.value ||
    (share.value && scope.value === "menu" && !navigation.value.length)
  )
    return;
  busy.value = true;
  error.value = "";
  try {
    if (!provider.value) await preview();
    if (!provider.value) return;
    const m = await send("/links", "POST", {
      url: url.value,
      title: title.value,
      ...(share.value
        ? {
            importOptions: {
              scope: scope.value,
              ...(scope.value === "menu"
                ? { selectedUrls: selectedUrls.value }
                : {}),
            },
          }
        : {}),
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
            :disabled="busy"
            placeholder="https://…"
            @blur="url && preview()"
        /></label>
        <div v-if="provider" class="notice success">
          <Icon name="check" />{{ provider }}
        </div>
        <fieldset v-if="share" class="import-scope" :disabled="busy">
          <legend>Что сохранить</legend>
          <label
            ><input
              v-model="scope"
              type="radio"
              value="article"
              name="scope"
            />Только статья</label
          >
          <label
            ><input
              v-model="scope"
              type="radio"
              value="branch"
              name="scope"
            />Статья и подстраницы</label
          >
          <label
            ><input v-model="scope" type="radio" value="menu" name="scope" />Всё
            публичное меню</label
          >
          <p class="muted small-text">
            {{
              scope === "branch"
                ? "Сохраним выбранную статью и все вложенные страницы. Новые страницы появятся после ручного обновления ветки."
                : scope === "menu"
                  ? "Снимите галочки со страниц, которые не нужны. Исходная статья остаётся в материале."
                  : "Сохраним только открытую статью. Ссылки на другие страницы ведут к источнику."
            }}
          </p>
          <template v-if="scope === 'menu'">
            <p v-if="navigationBusy" role="status">Получаем публичное меню…</p>
            <div v-else-if="navigation.length" class="import-tree">
              <p class="small-text">
                Выбрано страниц: {{ selectedUrls.length }} · до {{ MAX_PUBLICATION_PAGES }} страниц /
                100 МБ
              </p>
              <PublicationTree
                :nodes="navigation"
                :selected-urls="selectedUrls"
                :locked-url="canonicalUrl()"
                :disabled="busy"
                @toggle="togglePage"
              />
            </div>
            <button
              v-else
              type="button"
              class="button small"
              @click="loadNavigation"
            >
              Повторить загрузку меню
            </button>
          </template>
        </fieldset>
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
        <button
          class="button primary"
          :disabled="
            busy ||
            navigationBusy ||
            (share && scope === 'menu' && !navigation.length)
          "
        >
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
