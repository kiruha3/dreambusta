/** Neutral OOXML/editor boundary. Geometry uses 96-DPI pixels; ranges use UTF-16. */
export interface PresentationColor { r: number; g: number; b: number; a: number }
export interface PresentationBox {
  x: number; y: number; width: number; height: number; rotation: number; flipX: boolean; flipY: boolean
}
export interface PresentationTextStyle {
  fontFamily: string; fontSize: number; fontWeight: number; italic: boolean
  color: PresentationColor; underline: boolean; strike: boolean
}
export interface PresentationRun extends PresentationTextStyle { start: number; length: number }
export interface PresentationParagraph {
  start: number; length: number; align: "left" | "center" | "right" | "justify"; level: number
}
export interface PresentationText {
  content: string; defaultStyle: PresentationTextStyle; runs: PresentationRun[]
  paragraphs: PresentationParagraph[]; verticalAlign: "top" | "center" | "bottom"
  insets: { left: number; top: number; right: number; bottom: number }
}
export interface PresentationObjectCapabilities { geometry: boolean; text: boolean; style: boolean; remove: boolean }
export interface PresentationObjectBase {
  id: string; name: string; box: PresentationBox; locked: boolean
  capabilities: PresentationObjectCapabilities
  /** Optional logical clone origin, validated against this session, never an OOXML address. */
  cloneOf?: string
}
export interface PresentationShape extends PresentationObjectBase {
  kind: "shape"; shape: "rectangle" | "ellipse" | "line"; fill: PresentationColor | null
  stroke: { color: PresentationColor; width: number } | null; text?: PresentationText
}
export interface PresentationTextObject extends PresentationObjectBase { kind: "text"; text: PresentationText }
export interface PresentationImageObject extends PresentationObjectBase {
  kind: "image"; assetId: string; opacity: number
  crop?: { left: number; top: number; right: number; bottom: number }
}
export interface PresentationGroup extends PresentationObjectBase { kind: "group"; objects: PresentationObject[] }
export interface PresentationUnsupported extends PresentationObjectBase {
  kind: "unsupported"; label: string; previewAssetId?: string
}
export type PresentationObject = PresentationShape | PresentationTextObject | PresentationImageObject | PresentationGroup | PresentationUnsupported
export interface PresentationSlide {
  id: string; name: string; background: PresentationColor | null; objects: PresentationObject[]
  capabilities: { duplicate: boolean; delete: boolean }; cloneOf?: string
}
export interface PresentationImage { id: string; mime: "image/png" | "image/jpeg"; data: string }
export interface PresentationWarning { code: string; objectId?: string; slideId?: string; detail?: string }
export interface PresentationScene {
  id: string; width: number; height: number; slides: PresentationSlide[]
  assets: PresentationImage[]; warnings: PresentationWarning[]
}
