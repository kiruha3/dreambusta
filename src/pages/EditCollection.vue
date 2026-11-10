<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Collection, Material } from "../../shared/types";
import { api, send, notify } from "../api";
import Icon from "../components/Icon.vue";
const route = useRoute();
const router = useRouter();
const form = ref<
  Partial<Collection> & { title: string; materialIds: string[] }
>({ title: "", description: "", visible: true, materialIds: [] });
const all = ref<Material[]>([]);
const query = ref("");
const error = ref("");
const busy = ref(false);
let dragged = -1;
(async () => {
  try {
    all.value = await api("/materials");
    if (route.params.id)
      form.value = await api(`/collections/${route.params.id}`);
  } catch (e) {
    error.value = (e as Error).message;
  }
})();
const selected = computed(() =>
  form.value.materialIds
    .map((id) => all.value.find((m) => m.id === id))
    .filter((x): x is Material => !!x),
);
const available = computed(() =>
  all.value.filter(
    (m) =>
      !form.value.materialIds.includes(m.id) &&
      m.title.toLowerCase().includes(query.value.toLowerCase()),
  ),
);
function move(i: number, to: number) {
  if (i < 0 || to < 0 || to >= form.value.materialIds.length) return;
  const ids = [...form.value.materialIds];
  const [id] = ids.splice(i, 1);
  ids.splice(to, 0, id);
  form.value.materialIds = ids;
}
function drop(i: number) {
  move(dragged, i);
  dragged = -1;
}
async function save() {
  busy.value = true;
  error.value = "";
  try {
    const c = await send(
      `/collections${form.value.id ? "/" + form.value.id : ""}`,
      form.value.id ? "PATCH" : "POST",
      form.value,
    );
    notify("Подборка сохранена");
    await router.push(`/collections/${c.slug}`);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function remove() {
  if (
    !form.value.id ||
    !confirm("Удалить подборку? Материалы останутся в библиотеке.")
  )
    return;
  await send(`/collections/${form.value.id}`, "DELETE");
  await router.push("/collections");
}
</script>
<template>
  <RouterLink class="back-link" to="/collections"
    ><Icon name="back" />Подборки</RouterLink
  >
  <form @submit.prevent="save">
    <div class="page-heading">
      <div>
        <div class="eyebrow">ПОДБОРКА</div>
        <h1>{{ form.id ? "Редактировать подборку" : "Новая подборка" }}</h1>
        <p>Выберите материалы и расставьте в нужном порядке.</p>
      </div>
      <button class="button primary" :disabled="busy">
        Сохранить подборку
      </button>
    </div>
    <div v-if="error" class="notice danger" role="alert">{{ error }}</div>
    <div class="form-columns">
      <div class="stack">
        <section class="panel stack">
          <label class="field"
            >Название<input
              v-model="form.title"
              required
              maxlength="300" /></label
          ><label class="field"
            >Описание<textarea
              v-model="form.description"
              rows="3"
            ></textarea></label
          ><label v-if="form.id" class="field"
            >Адрес<input
              v-model="form.slug"
              pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label
          ><label class="check-label"
            ><input v-model="form.visible" type="checkbox" />Показывать в
            библиотеке</label
          >
        </section>
        <section class="panel stack">
          <div class="row between">
            <h2>Материалы подборки</h2>
            <span class="muted">{{ selected.length }}</span>
          </div>
          <p class="muted small-text">
            Перетаскивайте строки или используйте стрелки.
          </p>
          <div
            v-for="(m, i) in selected"
            :key="m.id"
            class="collection-row"
            draggable="true"
            @dragstart="dragged = i"
            @dragover.prevent
            @drop.prevent="drop(i)"
          >
            <Icon name="grip" /><span class="muted small-text">{{ i + 1 }}</span
            ><Icon :name="m.kind" /><strong class="grow">{{ m.title }}</strong
            ><button
              type="button"
              class="icon-button"
              :disabled="!i"
              :aria-label="`Поднять ${m.title}`"
              @click="move(i, i - 1)"
            >
              <Icon name="up" :size="15" /></button
            ><button
              type="button"
              class="icon-button"
              :disabled="i === selected.length - 1"
              :aria-label="`Опустить ${m.title}`"
              @click="move(i, i + 1)"
            >
              <Icon name="down" :size="15" /></button
            ><button
              type="button"
              class="icon-button"
              :aria-label="`Убрать ${m.title}`"
              @click="form.materialIds.splice(i, 1)"
            >
              <Icon name="close" :size="15" />
            </button>
          </div>
          <div v-if="!selected.length" class="empty compact">
            Выберите материалы справа
          </div>
        </section>
        <button
          v-if="form.id"
          type="button"
          class="button danger self-start"
          @click="remove"
        >
          Удалить подборку
        </button>
      </div>
      <aside class="panel stack">
        <h3>Добавить из библиотеки</h3>
        <label class="search-box"
          ><Icon name="search" /><input
            v-model="query"
            placeholder="Найти материал"
            aria-label="Поиск для подборки"
        /></label>
        <div class="available-list">
          <button
            v-for="m in available"
            :key="m.id"
            type="button"
            class="collection-row"
            @click="form.materialIds.push(m.id)"
          >
            <Icon :name="m.kind" /><span class="grow">{{ m.title }}</span
            ><Icon name="plus" :size="16" />
          </button>
          <p v-if="!available.length" class="muted small-text">
            Нет подходящих материалов
          </p>
        </div>
      </aside>
    </div>
  </form>
</template>
