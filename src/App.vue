<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute } from "vue-router";
import {
  session,
  send,
  loadSession,
  ui,
  loadNavigation,
  sidebarMaterials,
} from "./api";
import Icon from "./components/Icon.vue";
import SearchDialog from "./components/SearchDialog.vue";
import AssistantWidget from "./components/AssistantWidget.vue";
import { openSearch } from "./composables/search";
import { materialSection } from "./composables/navigation";
const route = useRoute();
const menu = ref(false);
const headerQuery = ref("");
const dark = ref(localStorage.getItem("dreambusta-theme") === "dark");
const section = computed(() => {
  if (route.path.startsWith("/library/")) return materialSection.value;
  if (route.path.startsWith("/collections")) return "collection";
  if (route.path === "/knowledge") return "knowledge";
  if (route.path === "/library") return route.query.view || "all";
  return "";
});
const pinnedActive = computed(
  () =>
    section.value === "all" &&
    sidebarMaterials.value.some((m) => route.path === `/library/${m.slug}`),
);
watch(
  dark,
  (value) => {
    document.documentElement.classList.toggle("dark", value);
    localStorage.setItem("dreambusta-theme", value ? "dark" : "light");
  },
  { immediate: true },
);
watch(
  () => route.fullPath,
  () => {
    menu.value = false;
    headerQuery.value = "";
  },
);
watch(
  () => [route.path, session.editor, session.closed],
  () => void loadNavigation(),
  { immediate: true },
);
async function logout() {
  await send("/logout", "POST", {});
  await loadSession();
  location.assign("/library");
}
</script>
<template>
  <div class="app-shell">
    <aside class="sidebar" :class="{ open: menu }">
      <RouterLink class="brand" to="/library"
        ><span class="brand-logo"><Icon name="library" :size="23" /></span
        >DreamBusta</RouterLink
      >
      <span class="eyebrow sidebar-label">БИБЛИОТЕКА</span>
      <nav aria-label="Библиотека">
        <RouterLink
          to="/library"
          :class="{ active: section === 'all' && !pinnedActive }"
          ><Icon name="library" />Все материалы</RouterLink
        >
        <RouterLink to="/knowledge" :class="{ active: section === 'knowledge' }"
          ><Icon name="book" />База знаний</RouterLink
        >
        <RouterLink
          to="/collections"
          :class="{ active: section === 'collection' }"
          ><Icon name="collections" />Подборки</RouterLink
        >
        <RouterLink
          to="/library?view=continue"
          :class="{ active: section === 'continue' }"
          ><Icon name="book" />Продолжить чтение</RouterLink
        >
        <RouterLink
          to="/library?view=favorites"
          :class="{ active: section === 'favorites' }"
          ><Icon name="heart" />Избранное</RouterLink
        >
      </nav>
      <template v-if="session.editor">
        <span class="eyebrow sidebar-label">УПРАВЛЕНИЕ</span>
        <nav aria-label="Управление">
          <RouterLink to="/admin" :class="{ active: route.path === '/admin' }"
            ><Icon name="grid" />Кабинет редактора</RouterLink
          >
          <RouterLink
            to="/admin/materials"
            :class="{ active: route.path.startsWith('/admin/materials') }"
            ><Icon name="filters" />Материалы</RouterLink
          >
          <RouterLink
            to="/admin/add"
            :class="{ active: route.path === '/admin/add' }"
            ><Icon name="plus" />Добавить материал</RouterLink
          >
          <RouterLink
            to="/admin/widgets"
            :class="{ active: route.path === '/admin/widgets' }"
            ><Icon name="chat" />Внешние помощники</RouterLink
          >
          <RouterLink
            to="/admin/settings"
            :class="{ active: route.path === '/admin/settings' }"
            ><Icon name="settings" />Настройки</RouterLink
          >
        </nav>
      </template>
      <template v-if="sidebarMaterials.length">
        <span class="eyebrow sidebar-label">БЫСТРЫЙ ДОСТУП</span>
        <nav aria-label="Выбранные материалы">
          <RouterLink
            v-for="m in sidebarMaterials"
            :key="m.id"
            :to="`/library/${m.slug}`"
            :class="{
              active: pinnedActive && route.path === `/library/${m.slug}`,
            }"
            ><Icon name="book" /><span>{{ m.title }}</span></RouterLink
          >
        </nav>
      </template>
      <div class="sidebar-foot"><small>DreamBusta</small></div>
    </aside>
    <button
      v-if="menu"
      class="nav-backdrop"
      aria-label="Закрыть меню"
      @click="menu = false"
    ></button>
    <div class="main-shell">
      <header class="topbar">
        <button
          class="icon-button mobile-menu"
          aria-label="Открыть меню"
          @click="menu = !menu"
        >
          <Icon name="menu" />
        </button>
        <form
          class="top-search"
          role="search"
          @submit.prevent="openSearch(headerQuery.trim() || undefined)"
        >
          <Icon name="search" :size="18" />
          <input
            v-model="headerQuery"
            aria-label="Поиск по всем материалам"
            placeholder="Поиск по текстам, названиям и темам"
            maxlength="300"
          />
          <button
            type="submit"
            class="button small global-search-trigger"
            aria-label="Поиск по библиотеке"
          >
            Найти <kbd>Ctrl K</kbd>
          </button>
        </form>
        <div class="row gap8 top-actions">
          <button
            class="icon-button"
            :aria-label="dark ? 'Светлая тема' : 'Тёмная тема'"
            @click="dark = !dark"
          >
            <Icon :name="dark ? 'sun' : 'moon'" />
          </button>
          <button
            v-if="session.editor"
            class="icon-button"
            aria-label="Выйти"
            @click="logout"
          >
            <Icon name="logout" />
          </button>
          <RouterLink v-else class="button small" to="/login">{{
            session.setupRequired ? "Создать редактора" : "Войти"
          }}</RouterLink>
          <span v-if="session.editor" class="avatar" :title="session.email">{{
            session.email?.slice(0, 1).toUpperCase()
          }}</span>
        </div>
      </header>
      <main id="main" class="content"><RouterView :key="route.path" /></main>
    </div>
    <div v-if="ui.notice" class="toast" role="status">
      <Icon name="check" />{{ ui.notice }}
    </div>
    <SearchDialog /><AssistantWidget />
  </div>
</template>
