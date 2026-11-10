import JSZip from 'jszip'
import { PRESENTATION_MAX_ENTRY_BYTES, PRESENTATION_MAX_OUTPUT_BYTES } from './constants.ts'
import { inspectZip } from './zip-directory.ts'

function checksum(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function boundedEntry(entry: JSZip.JSZipObject, expected: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const stream = entry.nodeStream('nodebuffer')
    const chunks: Buffer[] = []
    let size = 0
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > expected || size > PRESENTATION_MAX_ENTRY_BYTES) { stream.pause(); reject(Error('Превышен размер распакованной части ZIP')) }
      else chunks.push(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => size === expected ? resolve(Buffer.concat(chunks)) : reject(Error('Неверный размер части ZIP')))
  })
}
/** Reads validated entries with actual streamed size and CRC checks. */
export async function readArchive(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const records = inspectZip(bytes)
  const zip = await JSZip.loadAsync(bytes)
  const entries = new Map<string, Uint8Array>()
  for (const record of records) {
    const entry = zip.files[record.name]
    if (!entry || entry.dir) continue
    const content = await boundedEntry(entry, record.size)
    if (checksum(content) !== record.crc) throw Error('Ошибка CRC ZIP')
    entries.set(record.name, content)
  }
  return entries
}
/** Repackages preserved entry payloads without mutating the source map. */
export async function writeArchive(entries: Map<string, Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip()
  for (const [name, bytes] of entries) zip.file(name, bytes, { createFolders: false })
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  if (bytes.length > PRESENTATION_MAX_OUTPUT_BYTES) throw Error('Превышен размер сохранённого PPTX')
  inspectZip(bytes)
  return bytes
}
