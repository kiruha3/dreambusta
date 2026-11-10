import PptxGenJS from 'pptxgenjs'
import type { PresentationScene } from '../shared/presentation.ts'
import { openPptx } from './read.ts'
import { writePptx } from './write.ts'
import type { PptxDocument } from './types.ts'

/** Creates a genuine editable OOXML deck at an explicit physical size. */
export async function createPptx(scene: PresentationScene): Promise<PptxDocument> {
  const presentation = new PptxGenJS()
  presentation.defineLayout({ name: 'DREAMAGENT', width: scene.width / 96, height: scene.height / 96 })
  presentation.layout = 'DREAMAGENT'
  presentation.author = 'DreamAgent'
  for (const _slide of scene.slides) presentation.addSlide()
  const bytes = await presentation.write({ outputType: 'uint8array' })
  const document = await openPptx(bytes as Uint8Array)
  document.scene.id = scene.id
  const existing = [...document.slides.values()]
  document.slides.clear()
  document.scene.slides.forEach((slide, index) => {
    slide.id = scene.slides[index]!.id
    const binding = existing[index]!
    binding.baseline.id = slide.id
    document.slides.set(slide.id, binding)
  })
  return (await writePptx(document, scene)).document
}
