import type { Material } from "./types.ts";
export function isKnowledge(material: Material) {
  return (
    material.knowledge ??
    (material.source.type === "share" ||
      material.representations.includes("article"))
  );
}
