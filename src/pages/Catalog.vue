<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute } from "vue-router";
import type { Material } from "../../shared/types";
import { api, session, kindNames } from "../api";
import Icon from "../components/Icon.vue";
import MaterialCard from "../components/MaterialCard.vue";
const route = useRoute();
const items = ref<Material[]>([]);
const query = ref("");
const kind = ref("all");
const order = ref("new");
const error = ref("");
const loading = ref(true);
api<Material[]>("/materials")
  .then((x) => (items.value = x))
  .catch((e) => (error.value = e.message))
  .finally(() => (loading.value = false));
const title = computed(() =>
  route.query.view === "favorites"
    ? "Избранное"
    : route.query.view === "continue"
      ? "Продолжить чтение"
      : "Библиотека знаний",
);
const favorites = () => {
  try {
    return JSON.parse(
      localStorage.getItem("dreambusta-favorites") || "[]",
    ) as string[];
  } catch {
    return [];
  }
};
const filtered = computed(() =>
  items.value
    .filter(
      (m) =>
        (kind.value === "all" || m.kind === kind.value) &&
        `${m.title} ${m.author} ${m.description} ${m.tags.join(" ")}`
          .toLocaleLowerCase()
          .includes(query.value.toLocaleLowerCase()) &&
        (route.query.view !== "favorites" || favorites().includes(m.id)) &&
        (route.query.view !== "continue" ||
          localStorage.getItem(`dreambusta-progress:${m.id}:${m.textVersion}`)),
    )
    .sort((a, b) =>
      order.value === "title"
        ? a.title.localeCompare(b.title, "ru")
        : b.createdAt.localeCompare(a.createdAt),
    ),
);
watch(
  () => route.query,
  () => {
    query.value = "";
    kind.value = "all";
  },
);
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">ЧИТАТЬ. СМОТРЕТЬ. УЗНАВАТЬ.</div>
      <h1>{{ title }}</h1>
      <p>Книги, документы, видео и подкасты — всё в одном месте.</p>
    </div>
    <RouterLink v-if="session.editor" to="/admin/add" class="button primary"
      ><Icon name="plus" />Добавить материал</RouterLink
    >
  </div>
  <div class="catalog-tools">
    <label class="search-box"
      ><Icon name="search" /><input
        v-model="query"
        aria-label="Поиск материалов"
        placeholder="Название, автор или тема"
      /><kbd>/</kbd></label
    ><select v-model="order" aria-label="Сортировка">
      <option value="new">Сначала новые</option>
      <option value="title">По названию</option>
    </select>
  </div>
  <div class="filter-row" role="group" aria-label="Тип материала">
    <button :class="{ selected: kind === 'all' }" @click="kind = 'all'">
      Все материалы <span>{{ items.length }}</span></button
    ><button
      v-for="(label, key) in kindNames"
      :key="key"
      :class="{ selected: kind === key }"
      @click="kind = key"
    >
      <Icon :name="key" :size="15" />{{ label }}
    </button>
  </div>
  <div v-if="error" class="notice danger" role="alert">{{ error }}</div>
  <div v-else-if="loading" class="empty">Загружаем библиотеку…</div>
  <template v-else-if="filtered.length"
    ><div class="row between results">
      <span class="muted small-text">Материалов: {{ filtered.length }}</span
      ><span class="muted small-text">Доступно для чтения и просмотра</span>
    </div>
    <div class="cards">
      <MaterialCard v-for="m in filtered" :key="m.id" :material="m" /></div
  ></template>
  <div v-else class="empty panel">
    <span class="empty-icon"><Icon name="library" :size="33" /></span>
    <h2>
      {{
        items.length
          ? "Материалов пока нет"
          : "Ваша библиотека начинается здесь"
      }}
    </h2>
    <p>
      {{
        query || kind !== "all"
          ? "Попробуйте другой запрос или тип материала."
          : "Добавьте первый документ, книгу или ссылку. Материал получит постоянный адрес и будет доступен из ваших приложений."
      }}
    </p>
    <RouterLink v-if="session.editor" class="button primary" to="/admin/add"
      ><Icon name="plus" />Добавить материал</RouterLink
    ><RouterLink v-else class="button" to="/login">{{
      session.setupRequired ? "Настроить библиотеку" : "Войти как редактор"
    }}</RouterLink>
  </div>
</template>
