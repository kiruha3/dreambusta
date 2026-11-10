import type { IncomingMessage } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Store } from "./store.ts";
import type { Material } from "../shared/types.ts";
export async function saveCover(
  req: IncomingMessage,
  store: Store,
  m: Material,
  dataDir: string,
) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 5 * 1024 * 1024)
      throw new Error("Обложка должна быть не больше 5 МБ");
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks);
  const mime = data
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : data[0] === 255 && data[1] === 216 && data[2] === 255
      ? "image/jpeg"
      : data.toString("ascii", 0, 4) === "RIFF" &&
          data.toString("ascii", 8, 12) === "WEBP"
        ? "image/webp"
        : "";
  if (!mime) throw new Error("Выберите обложку PNG, JPEG или WebP");
  const relative = `covers/${randomUUID()}`;
  mkdirSync(join(dataDir, "covers"), { recursive: true });
  writeFileSync(join(dataDir, relative), data);
  return store.updateMaterial(
    m.id,
    {
      cover: "cover",
      files: {
        ...m.files,
        cover: {
          path: relative,
          mime,
          size,
          name: "cover." + mime.split("/")[1],
        },
      },
    },
    m.revision,
  );
}
