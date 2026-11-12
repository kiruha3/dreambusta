<script setup lang="ts">
import { paths } from "../lib/paths";
</script>
<template>
  <div class="empty">
    <h1>Страница не найдена</h1>
    <p>Проверьте адрес или откройте каталог.</p>
    <RouterLink class="button primary" :to="paths.catalog">В библиотеку</RouterLink>
  </div>
</template>
