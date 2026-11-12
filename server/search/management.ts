import { LocalModels } from "./models.ts";
import type { SearchService } from "./service.ts";
import type { Store } from "../store.ts";
import type {
  AISettings,
  AIStatus,
  ManagedModel,
  ModelPull,
} from "../../shared/models.ts";

export class ModelManagementError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function modelName(value: unknown): string {
  // Ollama registry identifiers only; URLs, local paths and shell syntax are never accepted.
  if (
    typeof value !== "string" ||
    value.length > 180 ||
    !/^(?:[a-zA-Z0-9][a-zA-Z0-9_-]*\/){0,2}[a-zA-Z0-9][a-zA-Z0-9._-]*(?::[a-zA-Z0-9][a-zA-Z0-9._-]*)?$/.test(
      value,
    )
  )
    throw new ModelManagementError(
      400,
      "Укажите имя модели Ollama, например embeddinggemma:latest",
    );
  return value.includes(":") ? value : value + ":latest";
}
export function savedAISettings(
  store: Store,
  defaults: LocalModels,
): AISettings {
  try {
    const saved = JSON.parse(store.setting("aiModels", "null"));
    if (saved && typeof saved.enabled === "boolean")
      return {
        enabled: saved.enabled,
        embeddingModel: modelName(saved.embeddingModel),
        answerModel: modelName(saved.answerModel),
      };
  } catch {
    /* Retain environment defaults if an old setting cannot be read. */
  }
  return {
    enabled: defaults.enabled,
    embeddingModel: defaults.embeddingModel,
    answerModel: defaults.answerModel,
  };
}
export class ModelManagement {
  private settings: AISettings;
  private pull: ModelPull | null = null;
  private pullController?: AbortController;
  private closed = false;
  private mutation = false;
  private environmentDisabled: boolean;
  private store: Store;
  private search: SearchService;
  private local: LocalModels;
  constructor(store: Store, search: SearchService, local: LocalModels) {
    this.store = store;
    this.search = search;
    this.local = local;
    this.environmentDisabled = process.env.DREAMBUSTA_AI === "off";
    this.settings = savedAISettings(store, local);
    this.apply();
  }
  private apply() {
    this.search.reconfigure(
      new LocalModels({
        url: this.local.url,
        ...this.settings,
        enabled: this.settings.enabled && !this.environmentDisabled,
      }),
    );
  }
  private async request(path: string, body?: unknown, signal?: AbortSignal) {
    try {
      const response = await fetch(this.local.url + path, {
        method:
          body === undefined
            ? "GET"
            : path === "/api/delete"
              ? "DELETE"
              : "POST",
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.any([
          AbortSignal.timeout(15000),
          ...(signal ? [signal] : []),
        ]),
        redirect: "error",
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error();
      }
      return response;
    } catch {
      throw new ModelManagementError(
        503,
        "Ollama недоступна. Проверьте службу Ollama на сервере.",
      );
    }
  }
  private async list(path: string): Promise<ManagedModel[]> {
    const response = await this.request(path);
    const data = await response.json();
    if (!Array.isArray(data.models))
      throw new ModelManagementError(
        503,
        "Ollama вернула некорректный список моделей",
      );
    return data.models.map((m: any) => ({
      name: String(m.name || m.model),
      size: Number(m.size) || 0,
      ...(path === "/api/ps"
        ? {
            sizeVram: Number(m.size_vram) || 0,
            expiresAt: String(m.expires_at || ""),
          }
        : {}),
    }));
  }
  async status(): Promise<AIStatus> {
    const base = {
      settings: { ...this.settings },
      effectiveEnabled: this.search.models.enabled,
      environmentDisabled: this.environmentDisabled,
      pull: this.pull ? { ...this.pull } : null,
    };
    try {
      const [installed, running] = await Promise.all([
        this.list("/api/tags"),
        this.list("/api/ps"),
      ]);
      return { ...base, online: true, installed, running };
    } catch (error) {
      return {
        ...base,
        online: false,
        installed: [],
        running: [],
        error: (error as Error).message,
      };
    }
  }
  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.mutation)
      throw new ModelManagementError(
        409,
        "Дождитесь завершения операции с моделями",
      );
    this.mutation = true;
    try {
      return await operation();
    } finally {
      this.mutation = false;
    }
  }
  async configure(body: any) {
    return this.exclusive(async () => {
      if (
        !body ||
        typeof body.enabled !== "boolean" ||
        Object.keys(body).some(
          (k) => !["enabled", "embeddingModel", "answerModel"].includes(k),
        )
      )
        throw new ModelManagementError(400, "Некорректные настройки моделей");
      const settings = {
        enabled: body.enabled,
        embeddingModel: modelName(body.embeddingModel),
        answerModel: modelName(body.answerModel),
      };
      if (
        settings.embeddingModel !== this.settings.embeddingModel ||
        settings.answerModel !== this.settings.answerModel ||
        settings.enabled
      ) {
        const installed = await this.list("/api/tags");
        if (
          ![settings.embeddingModel, settings.answerModel].every((name) =>
            installed.some((m) => modelName(m.name) === name),
          )
        )
          throw new ModelManagementError(
            400,
            "Сначала скачайте обе выбранные модели",
          );
      }
      this.store.setSetting("aiModels", JSON.stringify(settings));
      this.settings = settings;
      this.apply();
      return { ...settings };
    });
  }
  startPull(value: unknown) {
    const model = modelName(value);
    if (this.closed)
      throw new ModelManagementError(503, "Управление моделями остановлено");
    if (this.pull?.state === "running" || this.mutation)
      throw new ModelManagementError(
        409,
        "Уже выполняется операция с моделями",
      );
    const controller = new AbortController();
    this.pullController = controller;
    const job: ModelPull = {
      model,
      state: "running",
      status: "Подключение к Ollama",
      completed: 0,
      total: 0,
    };
    this.pull = job;
    void this.download(job, controller);
    return { ...job };
  }
  private async download(job: ModelPull, controller: AbortController) {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let headerTimeout: ReturnType<typeof setTimeout> | undefined;
    let headerTimedOut = false;
    try {
      // Pulls can take hours. Bound each read so a broken daemon cannot hold a job forever.
      headerTimeout = setTimeout(() => {
        headerTimedOut = true;
        controller.abort();
      }, 15000);
      headerTimeout.unref();
      const response = await fetch(this.local.url + "/api/pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: job.model, stream: true }),
        signal: controller.signal,
        redirect: "error",
      });
      clearTimeout(headerTimeout);
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error("Ollama не смогла скачать модель");
      }
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "",
        successful = false;
      const progress = (line: string) => {
        if (!line.trim()) return;
        const data = JSON.parse(line);
        if (data.error) throw new Error(String(data.error).slice(0, 500));
        job.status = String(data.status || "Загрузка").slice(0, 300);
        job.completed = Math.max(0, Number(data.completed) || 0);
        job.total = Math.max(0, Number(data.total) || 0);
        if (data.status === "success") successful = true;
      };
      for (;;) {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              controller.abort();
              reject(new Error("Ollama не передаёт прогресс загрузки"));
            }, 120000);
            timeout.unref();
          }),
        ]).finally(() => clearTimeout(timeout));
        if (chunk.done) break;
        pending += decoder.decode(chunk.value, { stream: true });
        if (pending.length > 65536)
          throw new Error("Некорректный прогресс Ollama");
        const lines = pending.split("\n");
        pending = lines.pop()!;
        for (const line of lines) progress(line);
      }
      progress(pending + decoder.decode());
      if (!successful)
        throw new Error("Ollama прервала загрузку до завершения");
      if (job.state === "running") {
        job.state = "complete";
        job.status = "Модель скачана";
      }
    } catch (error) {
      if (job.state === "running") {
        job.state = "failed";
        job.error = headerTimedOut
          ? "Ollama не ответила на запрос загрузки"
          : (error as Error).message;
        job.status = "Ошибка загрузки";
      }
    } finally {
      clearTimeout(headerTimeout);
      await reader?.cancel().catch(() => {});
      if (this.pullController === controller) this.pullController = undefined;
    }
  }
  cancelPull() {
    if (this.pull?.state === "running") {
      this.pull.state = "cancelled";
      this.pull.status = "Загрузка отменена";
      this.pullController?.abort();
    }
    return this.pull ? { ...this.pull } : null;
  }
  async unload(value: unknown) {
    return this.exclusive(async () => {
      const model = modelName(value);
      const running = await this.list("/api/ps");
      if (!running.some((m) => modelName(m.name) === model))
        throw new ModelManagementError(400, "Модель уже выгружена");
      const response = await this.request("/api/generate", {
        model,
        keep_alive: 0,
      });
      await response.body?.cancel();
    });
  }
  async delete(value: unknown) {
    return this.exclusive(async () => {
      const model = modelName(value);
      if (
        [this.settings.embeddingModel, this.settings.answerModel].includes(
          model,
        ) ||
        (this.pull?.state === "running" && this.pull.model === model)
      )
        throw new ModelManagementError(
          409,
          "Выбранную или скачиваемую модель удалить нельзя",
        );
      const installed = await this.list("/api/tags");
      if (!installed.some((m) => modelName(m.name) === model))
        throw new ModelManagementError(400, "Модель не установлена");
      const response = await this.request("/api/delete", { model });
      await response.body?.cancel();
    });
  }
  close() {
    this.closed = true;
    this.cancelPull();
  }
}
