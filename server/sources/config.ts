import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Operator-managed local configuration; never writable through the editor API.
export function readTrustedSourceOrigins(dataDir: string): string[] {
  const path = join(dataDir, "trusted-source-origins.json");
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf8");
  if (content.length > 8192)
    throw new Error("Слишком большой файл trusted-source-origins.json");
  const value = JSON.parse(content);
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some((x) => typeof x !== "string")
  )
    throw new Error(
      "trusted-source-origins.json должен содержать массив HTTPS origin",
    );
  return value;
}
