<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { session, send } from "../api";
import Icon from "../components/Icon.vue";
const email = ref("");
const password = ref("");
const error = ref("");
const busy = ref(false);
const route = useRoute();
const router = useRouter();
async function submit() {
  busy.value = true;
  error.value = "";
  try {
    Object.assign(
      session,
      await send(session.setupRequired ? "/setup" : "/login", "POST", {
        email: email.value,
        password: password.value,
      }),
    );
    const next = String(route.query.next || "/admin/materials");
    await router.push(
      next.startsWith("/") && !next.startsWith("//")
        ? next
        : "/admin/materials",
    );
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <form class="panel login-panel" @submit.prevent="submit">
    <span class="empty-icon"><Icon name="library" :size="30" /></span>
    <h1>
      {{ session.setupRequired ? "Начнём с редактора" : "Вход в библиотеку" }}
    </h1>
    <p class="muted">
      {{
        session.setupRequired
          ? "Создайте учётную запись с этого компьютера через localhost. Редактор сможет загружать и упорядочивать материалы."
          : "Войдите, чтобы управлять библиотекой."
      }}
    </p>
    <label class="field"
      >Email<input
        v-model="email"
        type="email"
        autocomplete="username"
        required /></label
    ><label class="field"
      >Пароль<input
        v-model="password"
        aria-label="Пароль"
        type="password"
        :autocomplete="
          session.setupRequired ? 'new-password' : 'current-password'
        "
        minlength="12"
        maxlength="256"
        required
      /><small>От 12 символов</small></label
    >
    <div v-if="error" class="notice danger" role="alert">{{ error }}</div>
    <button class="button primary full" :disabled="busy">
      {{
        busy
          ? "Подождите…"
          : session.setupRequired
            ? "Создать редактора"
            : "Войти"
      }}
    </button>
  </form>
</template>
