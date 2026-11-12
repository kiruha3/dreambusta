<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute } from "vue-router";
import { session, send, loadSession, ui } from "./api";
import Icon from "./components/Icon.vue";
import SearchDialog from "./components/SearchDialog.vue";
import AssistantWidget from "./components/AssistantWidget.vue";
import { openSearch } from "./composables/search";
const route = useRoute();
const admin = computed(() => route.path.startsWith("/admin"));
const menu = ref(false);
const dark = ref(localStorage.getItem("dreambusta-theme") === "dark");
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
  () => (menu.value = false),
);
async function logout() {
  await send("/logout", "POST", {});
  await loadSession();
  location.assign("/library");
}
</script>
<template>
  <div class="app-shell" :class="{ 'reader-shell': route.name === 'reader' }">
    <aside class="sidebar" :class="{ open: menu }">
      <RouterLink class="brand" to="/library"
        ><span class="brand-logo"><Icon name="library" :size="23" /></span
        >DreamBusta</RouterLink
      >
      <span class="eyebrow sidebar-label">ОБЩАЯ БИБЛИОТЕКА</span>
      <nav aria-label="Библиотека">
        <RouterLink
          to="/library"
          :class="{
            active: route.path.startsWith('/library') && !route.query.view,
          }"
          ><Icon name="library" />Все материалы</RouterLink
        >
        <RouterLink
          to="/collections"
          :class="{ active: route.path.startsWith('/collections') }"
          ><Icon name="collections" />Подборки</RouterLink
        >
        <RouterLink
          to="/library?view=continue"
          :class="{ active: route.query.view === 'continue' }"
          ><Icon name="book" />Продолжить чтение</RouterLink
        >
        <RouterLink
          to="/library?view=favorites"
          :class="{ active: route.query.view === 'favorites' }"
          ><Icon name="heart" />Избранное</RouterLink
        >
      </nav>
      <template v-if="session.editor"
        ><span class="eyebrow sidebar-label">УПРАВЛЕНИЕ</span>
        <nav aria-label="Управление">
          <RouterLink
            to="/admin/materials"
            :class="{ active: route.path.startsWith('/admin/materials') }"
            ><Icon name="filters" />Материалы</RouterLink
          >
          <RouterLink
            to="/admin/add"
            :class="{ active: route.path.startsWith('/admin/add') }"
            ><Icon name="plus" />Добавить материал</RouterLink
          >
          <RouterLink
            to="/admin/sources"
            :class="{ active: route.path.startsWith('/admin/sources') }"
            ><Icon name="link" />Источники</RouterLink
          >
          <RouterLink
            to="/admin/settings"
            :class="{ active: route.path.startsWith('/admin/settings') }"
            ><Icon name="settings" />Настройки</RouterLink
          >
        </nav></template
      >
      <div class="sidebar-foot">
        <div class="notice compact">
          <Icon name="info" /><span
            >Одна библиотека для чтения, Академии и приложения.</span
          >
        </div>
        <small>DreamBusta · локальная библиотека</small>
      </div>
    </aside>
    <button
      v-if="menu"
      class="nav-backdrop"
      aria-label="Закрыть меню"
      @click="menu = false"
    ></button>
    <div class="main-shell">
      <header class="topbar">
        <div class="row">
          <button
            class="icon-button mobile-menu"
            aria-label="Открыть меню"
            @click="menu = !menu"
          >
            <Icon name="menu" /></button
          ><span class="muted">{{
            admin ? "Управление библиотекой" : "Библиотека"
          }}</span
          ><span class="top-divider">/</span
          ><span>{{ admin ? "Редактор" : "Материалы и знания" }}</span>
        </div>
        <div class="row gap8">
          <button
            class="button small global-search-trigger"
            aria-label="Поиск по библиотеке"
            @click="openSearch"
          >
            <Icon name="search" :size="16" /><span>Поиск</span><kbd>Ctrl K</kbd>
          </button>
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
            <Icon name="logout" /></button
          ><RouterLink v-else class="button small" to="/login">{{
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
    <SearchDialog />
    <AssistantWidget />
  </div>
</template>
