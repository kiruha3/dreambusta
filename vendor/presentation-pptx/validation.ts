import type { PresentationObject, PresentationScene, PresentationSlide } from '../shared/presentation.ts'
import type { PresentationOrigins } from './origins.ts'
import type { PptxDocument } from './types.ts'

function orderedObject(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  // safe: validated above; neutral model objects contain enumerable JSON fields.
  const object = value as Record<string, unknown>
  return Object.fromEntries(Object.keys(object).sort().map(key => [key, object[key]]))
}
/** Compares neutral JSON values independently of renderer object property insertion order. */
export function equal(left: unknown, right: unknown): boolean { return JSON.stringify(left, orderedObject) === JSON.stringify(right, orderedObject) }
/** Traverses editor objects and their group children in source order. */
export function flatten(objects: PresentationObject[]): PresentationObject[] {
  return objects.flatMap(object => object.kind === 'group' ? [object, ...flatten(object.objects)] : [object])
}
function textOf(object: PresentationObject) { return object.kind === 'text' || object.kind === 'shape' ? object.text : undefined }
function identityFree(object: PresentationObject): PresentationObject {
  const base = { ...object, id: '', cloneOf: undefined }
  return base.kind === 'group' ? { ...base, objects: base.objects.map(identityFree) } : base
}
function forbidden(allowed: boolean, before: unknown, after: unknown, message: string): void {
  if (!allowed && !equal(before, after)) throw Error(message)
}
function assertStyle(before: PresentationObject, after: PresentationObject): void {
  if (before.kind !== 'shape' || after.kind !== 'shape') return
  forbidden(before.capabilities.style, before.fill, after.fill, 'Изменение стиля запрещено')
  forbidden(before.capabilities.style, before.stroke, after.stroke, 'Изменение линии запрещено')
}
function assertEditable(before: PresentationObject, after: PresentationObject): void {
  if (before.kind !== after.kind) throw Error('Нельзя менять тип исходного объекта')
  if (!equal(before.capabilities, after.capabilities)) throw Error('Изменение возможностей объекта запрещено')
  if (before.locked !== after.locked) throw Error('Изменение прав объекта запрещено')
  forbidden(before.capabilities.geometry, before.box, after.box, 'Изменение геометрии объекта запрещено')
  forbidden(before.capabilities.text, textOf(before), textOf(after), 'Изменение текста объекта запрещено')
  forbidden(!before.locked, identityFree(before), identityFree(after), 'Заблокированный объект изменён')
  assertStyle(before, after)
}
function parents(slides: PresentationSlide[]): Map<string, string> {
  const result = new Map<string, string>()
  const visit = (objects: PresentationObject[], parent: string) => {
    for (const object of objects) {
      result.set(object.id, parent)
      if (object.kind === 'group') visit(object.objects, object.id)
    }
  }
  for (const slide of slides) visit(slide.objects, slide.id)
  return result
}
function validateExisting(document: PptxDocument, scene: PresentationScene): void {
  const incoming = new Map(scene.slides.flatMap(slide => flatten(slide.objects)).map(object => [object.id, object]))
  const beforeParents = parents(document.scene.slides)
  const afterParents = parents(scene.slides)
  const retainedSlides = new Set(scene.slides.map(slide => slide.id))
  for (const slide of document.scene.slides.filter(item => retainedSlides.has(item.id))) {
    for (const before of flatten(slide.objects)) validateExistingObject(document, before, incoming.get(before.id), beforeParents, afterParents)
  }
}
function validateClone(document: PptxDocument, object: PresentationObject, origins: PresentationOrigins): void {
  if (!object.cloneOf || document.objects.has(object.id)) return
  const binding = origins.objects.get(object.id)
  if (binding) assertEditable(binding.baseline, object)
  else if (object.kind === 'unsupported') throw Error('Неизвестный источник неподдержанного объекта')
}
function validateSlide(document: PptxDocument, slide: PresentationSlide, origins: PresentationOrigins): void {
  if (slide.cloneOf && !document.slides.has(slide.id)) {
    const binding = origins.slides.get(slide.id)
    if (binding?.baseline.capabilities.duplicate === false) throw Error('Дублирование слайда запрещено')
  }
  for (const object of flatten(slide.objects)) validateClone(document, object, origins)
}
/** Checks trusted source capabilities, group membership and clone references. */
export function validateEdits(document: PptxDocument, scene: PresentationScene, origins: PresentationOrigins): void {
  if (scene.id !== document.scene.id) throw Error('Презентация принадлежит другой сессии')
  const allIds = [...scene.slides.map(slide => slide.id), ...scene.slides.flatMap(slide => flatten(slide.objects).map(object => object.id))]
  if (new Set(allIds).size !== allIds.length) throw Error('Повторяющийся logical ID')
  for (const before of document.scene.slides) {
    const retained = scene.slides.some(slide => slide.id === before.id)
    if (!retained && !before.capabilities.delete) throw Error('Удаление слайда с неизвестными связями запрещено')
  }
  for (const slide of scene.slides) validateSlide(document, slide, origins)
  validateExisting(document, scene)
}

function validateExistingObject(document: PptxDocument, before: PresentationObject, after: PresentationObject | undefined, beforeParents: Map<string, string>, afterParents: Map<string, string>): void {
  if (!after) {
    if (!before.capabilities.remove) throw Error('Удаление неподдержанного объекта запрещено')
    return
  }
  if (beforeParents.get(before.id) !== afterParents.get(before.id)) throw Error('Перенос между группами или слайдами запрещён')
  assertEditable(document.objects.get(before.id)?.baseline ?? before, after)
}
