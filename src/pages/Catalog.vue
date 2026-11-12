<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute } from "vue-router";
import type { Material } from "../../shared/types";
import { api, session, kindNames } from "../api";
import Icon from "../components/Icon.vue";
import MaterialCard from "../components/MaterialCard.vue";
import { openSearch } from "../composables/search";
const route = useRoute();
const items = ref<Material[]>([]);
const query = ref("");
const kind = ref("all");
const order = ref("new");
const error = ref("");
const loading = ref(true);
const knowledge = computed(() => route.path === "/knowledge");
const cardContext = computed(() =>
  knowledge.value
    ? { from: "knowledge" }
    : route.query.view === "favorites" || route.query.view === "continue"
      ? { from: route.query.view }
      : {},
);
api<Material[]>(knowledge.value ? "/materials?section=knowledge" : "/materials")
  .then((x) => (items.value = x))
  .catch((e) => (error.value = e.message))
  .finally(() => (loading.value = false));
const title = computed(() =>
  route.query.view === "favorites"
    ? "Избранное"
    : route.query.view === "continue"
      ? "Продолжить чтение"
      : knowledge.value
        ? "База знаний"
        : "Все материалы",
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
      <h1>{{ title }}</h1>
    </div>
    <RouterLink v-if="session.editor" to="/admin/add" class="button primary"
      ><Icon name="plus" />Добавить материал</RouterLink
    >
  </div>
  <div class="catalog-tools">
    <button
      class="search-box catalog-search-trigger"
      aria-label="Поиск материалов"
      @click="openSearch"
    >
      <Icon name="search" /><span>Поиск по текстам, названиям и темам</span
      ><kbd>Ctrl K</kbd></button
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
      <MaterialCard
        v-for="m in filtered"
        :key="m.id"
        :material="m"
        :context="cardContext"
      /></div
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
          : knowledge
            ? "Добавьте статью или включите материал в базу знаний через его настройки."
            : "Добавьте документ, книгу или ссылку."
      }}
    </p>
    <RouterLink v-if="session.editor" class="button primary" to="/admin/add"
      ><Icon name="plus" />Добавить материал</RouterLink
    ><RouterLink v-else class="button" to="/login">{{
      session.setupRequired ? "Настроить библиотеку" : "Войти как редактор"
    }}</RouterLink>
  </div>
</template>
