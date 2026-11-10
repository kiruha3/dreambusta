import type { PresentationScene } from '../shared/presentation.ts'
import { flatten } from './validation.ts'
import type { PptxDocument } from './types.ts'

/** Retains client logical/asset identities after source addresses were independently reparsed. */
export function commitCandidate(candidate: PptxDocument, scene: PresentationScene): PptxDocument {
  const objects = new Map(scene.slides.flatMap(slide => flatten(slide.objects)).map(object => [object.id, object]))
  for (const [id, binding] of candidate.objects) {
    const object = objects.get(id)
    if (!object) continue
    binding.baseline = { ...structuredClone(object), capabilities: binding.baseline.capabilities, locked: binding.baseline.locked }
  }
  for (const slide of scene.slides) {
    const binding = candidate.slides.get(slide.id)
    if (binding) binding.baseline = { ...structuredClone(slide), capabilities: binding.baseline.capabilities }
  }
  candidate.scene = structuredClone(scene)
  return candidate
}
