<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Material } from "../../shared/types";
import { api, send, notify, date, fileUrl, uploadFile } from "../api";
import Icon from "../components/Icon.vue";
const route = useRoute();
const router = useRouter();
const m = ref<Material>();
const error = ref("");
const busy = ref(false);
const tags = ref("");
const file = ref<HTMLInputElement>();
const coverInput = ref<HTMLInputElement>();
const progress = ref(0);
const transcript = ref("");
void api(`/materials/${route.params.id}/transcript`)
  .then((x) => (transcript.value = x.markdown || ""))
  .catch(() => {});
async function saveTranscript() {
  if (!m.value) return;
  busy.value = true;
  error.value = "";
  try {
    m.value = await send(`/materials/${m.value.id}/transcript`, "PUT", {
      markdown: transcript.value,
    });
    notify("Расшифровка сохранена");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
api<Material>(`/materials/${route.params.id}`)
  .then((x) => {
    m.value = x;
    tags.value = x.tags.join(", ");
  })
  .catch((e) => (error.value = e.message));
async function save() {
  if (!m.value) return;
  busy.value = true;
  error.value = "";
  try {
    m.value = await send(`/materials/${m.value.id}`, "PATCH", {
      title: m.value.title,
      author: m.value.author,
      description: m.value.description,
      slug: m.value.slug,
      visible: m.value.visible,
      downloadable: m.value.downloadable,
      tags: tags.value
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    });
    notify("Изменения сохранены");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function version(files: FileList | null) {
  if (!m.value || !files?.[0]) return;
  busy.value = true;
  error.value = "";
  try {
    m.value = await uploadFile(
      files[0],
      (n) => (progress.value = n),
      m.value.id,
    );
    notify("Версия обновлена");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function cover(files: FileList | null) {
  if (!m.value || !files?.[0]) return;
  busy.value = true;
  error.value = "";
  try {
    m.value = await api(`/materials/${m.value.id}/cover`, {
      method: "POST",
      body: files[0],
    });
    notify("Обложка сохранена");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function remove() {
  if (
    !m.value ||
    !confirm(`Удалить «${m.value.title}» из библиотеки и всех подборок?`)
  )
    return;
  try {
    await send(`/materials/${m.value.id}`, "DELETE");
    notify("Материал удалён");
    await router.push("/admin/materials");
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function refresh() {
  if (
    !m.value ||
    !confirm(
      "Обновить публикацию? Если источник закрыл доступ, вы сможете оставить сохранённую версию или завершить обновление с потерей доступа к ней.",
    )
  )
    return;
  busy.value = true;
  try {
    m.value = await send(`/materials/${m.value.id}/refresh`, "POST", {});
    notify(
      m.value!.source.status === "saved"
        ? "Публикация обновлена"
        : "Сохранённая версия оставлена",
    );
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function finish() {
  if (
    busy.value ||
    !m.value ||
    !confirm(
      "Завершить обновление? Сохранённые текст и ресурсы станут недоступны. Это действие нельзя отменить через интерфейс.",
    )
  )
    return;
  busy.value = true;
  try {
    m.value = await send(
      `/materials/${m.value.id}/finish-unavailable`,
      "POST",
      {},
    );
    notify("Обновление завершено");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function copy() {
  if (!m.value) return;
  try {
    await navigator.clipboard.writeText(
      `${location.origin}/library/${m.value.slug}`,
    );
    notify("Ссылка скопирована");
  } catch {
    notify("Ссылка: " + location.origin + "/library/" + m.value.slug);
  }
}
</script>
<template>
  <RouterLink to="/admin/materials" class="back-link"
    ><Icon name="back" />Материалы</RouterLink
  >
  <div v-if="error" class="notice danger" role="alert">{{ error }}</div>
  <form v-if="m" @submit.prevent="save">
    <div class="page-heading">
      <div>
        <div class="eyebrow">КАРТОЧКА МАТЕРИАЛА</div>
        <h1>{{ m.title }}</h1>
        <p>Обновлён {{ date(m.updatedAt) }}</p>
      </div>
      <div class="row wrap">
        <RouterLink class="button" :to="`/library/${m.slug}`"
          ><Icon name="external" />Открыть</RouterLink
        ><button class="button primary" :disabled="busy">
          {{ busy ? "Сохраняем…" : "Сохранить" }}
        </button>
      </div>
    </div>
    <div class="form-columns">
      <div class="stack">
        <section class="panel stack">
          <h2>Основная информация</h2>
          <label class="field"
            >Название<input v-model="m.title" required maxlength="300" /></label
          ><label class="field"
            >Автор<input v-model="m.author" maxlength="300" /></label
          ><label class="field"
            >Описание<textarea
              v-model="m.description"
              rows="4"
              maxlength="10000"
            ></textarea></label
          ><label class="field"
            >Теги через запятую<input v-model="tags"
          /></label>
        </section>
        <section class="panel stack">
          <h2>Постоянная ссылка</h2>
          <label class="field"
            >Адрес материала
            <div class="slug-input">
              <span>/library/</span
              ><input
                v-model="m.slug"
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                maxlength="100"
              />
            </div>
            <small
              >Изменение названия не меняет ссылку. После смены адреса старые
              ссылки продолжат открывать этот материал.</small
            ></label
          ><button type="button" class="button self-start" @click="copy">
            <Icon name="copy" />Скопировать ссылку
          </button>
        </section>
        <section v-if="m.source.type === 'file'" class="panel stack">
          <h2>Файл и представления</h2>
          <div v-if="m.state === 'error'" class="notice danger">
            {{ m.error }}
          </div>
          <p>
            {{ m.files.original?.name }}
            <span class="muted"
              >·
              {{ ((m.files.original?.size || 0) / 1024 / 1024).toFixed(2) }}
              МБ</span
            >
          </p>
          <div class="row wrap">
            <span v-for="r in m.representations" :key="r" class="badge">{{
              r
            }}</span>
          </div>
          <div v-for="w in m.warnings" :key="w" class="notice compact">
            {{ w }}
          </div>
          <input
            ref="file"
            type="file"
            class="sr-only"
            aria-label="Файл новой версии"
            @change="version(($event.target as HTMLInputElement).files)"
          /><button
            type="button"
            class="button self-start"
            :disabled="busy"
            @click="file?.click()"
          >
            <Icon name="upload" />Загрузить новую версию</button
          ><small class="muted"
            >Адрес и место в подборках сохранятся. Позиция чтения новой версии
            хранится отдельно.</small
          >
        </section>
        <section v-if="m.source.type !== 'file'" class="panel stack">
          <h2>Источник материала</h2>
          <a
            :href="m.source.url"
            target="_blank"
            rel="noopener noreferrer"
            class="source-url"
            >{{ m.source.url }}</a
          ><template v-if="m.source.type === 'share'"
            ><p>Сохранённая версия · {{ date(m.source.savedAt) }}</p>
            <div class="notice">
              Открытие использует сохранённую публикацию. Источник проверяется
              только по кнопке обновления.
            </div>
            <div v-if="m.source.message" class="notice warning">
              {{ m.source.message }}. Сохранённый текст остаётся доступен.
            </div>
            <div class="row wrap">
              <button
                class="button"
                type="button"
                :disabled="busy"
                @click="refresh"
              >
                <Icon name="refresh" />Обновить из источника</button
              ><button
                v-if="m.source.status === 'unavailable'"
                class="button danger"
                type="button"
                :disabled="busy"
                @click="finish"
              >
                Завершить обновление</button
              ><button
                v-if="m.source.status === 'unavailable'"
                class="button"
                type="button"
                @click="notify('Сохранённая версия остаётся доступна')"
              >
                Оставить версию
              </button>
            </div></template
          >
        </section>
      </div>
      <aside class="stack">
        <section
          v-if="m.kind === 'video' || m.kind === 'audio'"
          class="panel stack"
        >
          <h3>Опубликованная расшифровка</h3>
          <label class="field"
            >Текст Markdown<textarea
              v-model="transcript"
              rows="10"
              placeholder="Добавьте готовую расшифровку…"
            ></textarea></label
          ><small class="muted"
            >Текст и скорочтение станут доступны после сохранения.</small
          ><button
            type="button"
            class="button"
            :disabled="busy"
            @click="saveTranscript"
          >
            Сохранить расшифровку
          </button>
        </section>
        <section class="panel stack">
          <h3>Доступ</h3>
          <label class="check-label"
            ><input v-model="m.visible" type="checkbox" />Показывать в
            библиотеке</label
          ><label class="check-label"
            ><input v-model="m.downloadable" type="checkbox" />Показывать
            скачивание оригинала</label
          ><small class="muted"
            >Браузер получает данные для просмотра. Этот параметр управляет
            кнопкой скачивания и не является защитой от копирования.</small
          >
        </section>
        <section class="panel stack">
          <h3>Обложка</h3>
          <img
            v-if="m.cover"
            class="cover-preview"
            :src="
              fileUrl(m.id, 'cover') + '?v=' + encodeURIComponent(m.updatedAt)
            "
            alt="Обложка материала"
          />
          <div v-else class="cover-placeholder">
            <Icon :name="m.kind" :size="48" />
          </div>
          <input
            ref="coverInput"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            class="sr-only"
            aria-label="Файл обложки"
            @change="cover(($event.target as HTMLInputElement).files)"
          /><button
            type="button"
            class="button"
            :disabled="busy"
            @click="coverInput?.click()"
          >
            Загрузить обложку</button
          ><small class="muted">PNG, JPEG или WebP до 5 МБ</small>
        </section>
        <button type="button" class="button danger" @click="remove">
          <Icon name="delete" />Удалить материал
        </button>
      </aside>
    </div>
  </form>
</template>
