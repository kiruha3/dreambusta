<script setup lang="ts">
import Icon from "../components/Icon.vue";
const sections = [
  {
    to: "/admin/add",
    icon: "plus",
    title: "Добавить материал",
    description: "Загрузить файл или сохранить публикацию по ссылке.",
  },
  {
    to: "/admin/materials",
    icon: "library",
    title: "Материалы",
    description: "Править тексты, видимость, обложки и версии файлов.",
  },
  {
    to: "/collections",
    icon: "collections",
    title: "Подборки",
    description: "Собирать материалы и менять их порядок.",
  },
  {
    to: "/admin/sources",
    icon: "link",
    title: "Источники",
    description: "Проверять импортированные публикации и обновления.",
  },
  {
    to: "/admin/widgets",
    icon: "chat",
    title: "Внешние помощники",
    description: "Настроить помощника и получить код для другого сайта.",
  },
  {
    to: "/admin/settings",
    icon: "settings",
    title: "Настройки",
    description: "Управлять доступом и быстрыми ссылками в меню.",
  },
];
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">УПРАВЛЕНИЕ</div>
      <h1>Кабинет редактора</h1>
      <p>Контент и настройки Дримбусты.</p>
    </div>
  </div>
  <div class="admin-grid">
    <RouterLink
      v-for="s in sections"
      :key="s.to"
      :to="s.to"
      class="panel admin-tile"
      ><Icon :name="s.icon" :size="24" />
      <h2>{{ s.title }}</h2>
      <p class="muted">{{ s.description }}</p></RouterLink
    >
  </div>
</template>
