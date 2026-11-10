<script setup lang="ts">
import { ref } from "vue";
import { api, send, session, notify } from "../api";
const closed = ref(session.closed);
const error = ref("");
const busy = ref(false);
api("/settings")
  .then((x) => (closed.value = x.closed))
  .catch((e) => (error.value = e.message));
async function save() {
  busy.value = true;
  try {
    await send("/settings", "PATCH", { closed: closed.value });
    session.closed = closed.value;
    notify("Настройки сохранены");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">УПРАВЛЕНИЕ</div>
      <h1>Настройки библиотеки</h1>
      <p>Доступ и подключение других приложений.</p>
    </div>
  </div>
  <form class="panel stack max-form" @submit.prevent="save">
    <h2>Доступ к каталогу</h2>
    <label class="check-label"
      ><input v-model="closed" type="checkbox" />Закрыть библиотеку для
      посетителей без входа</label
    >
    <p class="muted">
      В локальной версии вход доступен редактору. Подключение SSO и
      пользовательских ролей выполняется отдельно при развёртывании.
    </p>
    <div v-if="error" class="notice danger">{{ error }}</div>
    <button class="button primary self-start" :disabled="busy">
      Сохранить настройки
    </button>
  </form>
  <section class="panel stack max-form">
    <h2>Подключение к Академии</h2>
    <p>
      В меню Академии добавляется отдельная ссылка на <code>/library</code> или
      <code>/collections/имя-подборки</code>. Материалы остаются
      самостоятельными записями библиотеки.
    </p>
    <h3>Хранение</h3>
    <p class="muted">
      SQLite, исходники и сохранённые публикации находятся в каталоге сервера
      <code>data/</code>. Для переноса остановите API и скопируйте весь каталог.
      Инструкция по резервному копированию — в README проекта.
    </p>
  </section>
</template>
