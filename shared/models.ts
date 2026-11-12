export interface AISettings {
  enabled: boolean;
  embeddingModel: string;
  answerModel: string;
}
export interface ManagedModel {
  name: string;
  size: number;
  sizeVram?: number;
  expiresAt?: string;
}
export interface ModelPull {
  model: string;
  state: "running" | "complete" | "cancelled" | "failed";
  status: string;
  completed: number;
  total: number;
  error?: string;
}
export interface AIStatus {
  online: boolean;
  error?: string;
  settings: AISettings;
  effectiveEnabled: boolean;
  environmentDisabled: boolean;
  installed: ManagedModel[];
  running: ManagedModel[];
  pull: ModelPull | null;
}
