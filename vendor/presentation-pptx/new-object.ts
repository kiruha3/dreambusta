import type { Element } from '@xmldom/xmldom'
import type { PresentationObject } from '../shared/presentation.ts'
import { append } from './xml.ts'

const TAGS = {
  image: { shape: 'p:pic', visual: 'p:nvPicPr', nonvisual: 'p:cNvPicPr', properties: 'p:spPr' },
  group: { shape: 'p:grpSp', visual: 'p:nvGrpSpPr', nonvisual: 'p:cNvGrpSpPr', properties: 'p:grpSpPr' },
  text: { shape: 'p:sp', visual: 'p:nvSpPr', nonvisual: 'p:cNvSpPr', properties: 'p:spPr' },
  shape: { shape: 'p:sp', visual: 'p:nvSpPr', nonvisual: 'p:cNvSpPr', properties: 'p:spPr' },
}
/** Creates a native object skeleton with independent shape identity. */
export function newShape(tree: Element, object: PresentationObject, shapeId: string): Element {
  if (object.kind === 'unsupported') throw Error('Нельзя создать неподдержанный OOXML объект')
  const tags = TAGS[object.kind]
  const shape = append(tree, tags.shape)
  const visual = append(shape, tags.visual)
  const identity = append(visual, 'p:cNvPr')
  identity.setAttribute('id', shapeId)
  identity.setAttribute('name', object.name)
  const nonvisual = append(visual, tags.nonvisual)
  if (object.kind === 'text') nonvisual.setAttribute('txBox', '1')
  append(visual, 'p:nvPr')
  if (object.kind === 'image') append(shape, 'p:blipFill')
  const properties = append(shape, tags.properties)
  append(properties, 'a:xfrm')
  if (object.kind !== 'group') addPreset(properties, object)
  return shape
}
function addPreset(properties: Element, object: Exclude<PresentationObject, { kind: 'unsupported' | 'group' }>): void {
  const preset = object.kind === 'shape' ? ({ rectangle: 'rect', ellipse: 'ellipse', line: 'line' })[object.shape] : 'rect'
  append(properties, 'a:prstGeom').setAttribute('prst', preset)
}
