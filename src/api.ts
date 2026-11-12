import { reactive, ref } from "vue";
import type { Session, Material } from "../shared/types.ts";
export const session = reactive<Session>({
  setupRequired: false,
  editor: false,
  closed: false,
});
export const ui = reactive({ notice: "", error: "" });
export const sidebarMaterials = ref<
  Pick<Material, "id" | "slug" | "title" | "kind">[]
>([]);
let navigationGeneration = 0;
export async function loadNavigation() {
  const generation = ++navigationGeneration;
  try {
    const response = await api<{ materials: typeof sidebarMaterials.value }>(
      "/navigation",
    );
    if (generation === navigationGeneration)
      sidebarMaterials.value = response.materials;
  } catch {
    if (generation === navigationGeneration) sidebarMaterials.value = [];
  }
}
let notification: ReturnType<typeof setTimeout>;
export function notify(message: string) {
  ui.notice = message;
  clearTimeout(notification);
  notification = setTimeout(() => (ui.notice = ""), 4500);
}
export async function api<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body && typeof init.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...(session.csrf ? { "X-CSRF-Token": session.csrf } : {}),
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => ({
    error:
      response.status === 413
        ? "Файл превышает лимит загрузки сервера"
        : "Сервер вернул некорректный ответ",
  }));
  if (!response.ok)
    throw Object.assign(new Error(data.error || "Ошибка запроса"), {
      status: response.status,
    });
  return data;
}
export const send = <T = any>(path: string, method: string, body?: unknown) =>
  api<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
export async function loadSession() {
  Object.assign(session, await api<Session>("/session"));
}
export function fileUrl(id: string, key = "original") {
  return `/api/materials/${encodeURIComponent(id)}/file/${encodeURIComponent(key)}`;
}
export function uploadFile(
  file: File,
  progress: (v: number) => void,
  id?: string,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `/api/${id ? `materials/${id}/version` : "uploads"}?name=${encodeURIComponent(file.name)}`,
    );
    if (session.csrf) xhr.setRequestHeader("X-CSRF-Token", session.csrf);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("Не удалось связаться с сервером"));
    xhr.onload = () => {
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        return reject(
          new Error(
            xhr.status === 413
              ? "Превышен размер файла на сервере"
              : "Некорректный ответ сервера",
          ),
        );
      }
      if (xhr.status >= 400) reject(new Error(data.error));
      else resolve(data);
    };
    xhr.send(file);
  });
}
export const kindNames = {
  book: "Книги",
  document: "Документы",
  presentation: "Презентации",
  video: "Видео",
  audio: "Подкасты и аудио",
};
export const modeNames: Record<string, string> = {
  article: "Статья",
  text: "Текст",
  speed: "WBook",
  pdf: "PDF",
  docx: "Документ",
  slides: "Слайды",
  video: "Видео",
  audio: "Аудио",
};
export function date(value?: string) {
  return value
    ? new Date(value).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
}
