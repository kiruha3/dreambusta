import type { Document, Element } from '@xmldom/xmldom'
import type { PresentationColor, PresentationObject, PresentationScene, PresentationSlide } from '../shared/presentation.ts'

/** Source coordinates normalized into the enclosing editor group. */
export type CoordinateSpace = { scaleX: number; scaleY: number; originX: number; originY: number }
/** A source element belongs to exactly one logical object in this document. */
export type ObjectBinding = {
  part: string; ownerSlide: string; shapeId: string; inherited: boolean; space: CoordinateSpace
  baseline: PresentationObject
}
/** Slide identities and relationship addresses stay in main. */
export type SlideBinding = { part: string; relationshipId: string; numericId: string; baseline: PresentationSlide }
/** Immutable source checkpoint. Saving creates a new checkpoint. */
export type PptxDocument = {
  scene: PresentationScene; originalBytes?: Uint8Array; entries: Map<string, Uint8Array>
  objects: Map<string, ObjectBinding>; slides: Map<string, SlideBinding>
}
/** Parsed package data, including documents cached only within one operation. */
export type PackageContext = { entries: Map<string, Uint8Array>; xml: Map<string, Document & { documentElement: Element }>; nextSlideId?: number; slideIds?: Set<number>; imageTargets?: Map<string, string>; assetIds?: Map<string, string> }
/** Inherited shapes and text sources, closest source first. */
export type ShapeContext = {
  package: PackageContext; part: string; layout?: Element; master?: Element; theme?: Element
  defaultText?: Element; colorMap?: Element; placeholderColor?: PresentationColor; canRemove?: boolean; inherited: boolean; space: CoordinateSpace
}
