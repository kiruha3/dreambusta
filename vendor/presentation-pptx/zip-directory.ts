import { PRESENTATION_MAX_EXPANDED_BYTES, PRESENTATION_MAX_ENTRY_BYTES, PRESENTATION_MAX_FILE_BYTES, PRESENTATION_MAX_ZIP_ENTRIES } from './constants.ts'

/** Validated central directory record. */
export type ZipRecord = { name: string; size: number; crc: number }
function endOffset(data: Buffer): number {
  const start = Math.max(0, data.length - 65557)
  for (let index = data.length - 22; index >= start; index--) {
    if (data.readUInt32LE(index) === 0x06054b50 && index + 22 + data.readUInt16LE(index + 20) === data.length) return index
  }
  throw Error('Повреждённый ZIP: отсутствует directory')
}
function entryName(data: Buffer, offset: number): string {
  const length = data.readUInt16LE(offset + 28)
  const name = data.subarray(offset + 46, offset + 46 + length).toString('utf8')
  const invalid = !name || name.includes('\\') || name.includes('\0') || name.startsWith('/') || name.includes(':')
  if (invalid || name.split('/').some(segment => segment === '..' || segment === '.')) throw Error('Небезопасный путь ZIP')
  return name
}
function validateEntry(data: Buffer, offset: number, directory: number): ZipRecord {
  if (offset + 46 > data.length || data.readUInt32LE(offset) !== 0x02014b50) throw Error('Повреждённый ZIP directory')
  const flags = data.readUInt16LE(offset + 8)
  const method = data.readUInt16LE(offset + 10)
  const compressed = data.readUInt32LE(offset + 20)
  const size = data.readUInt32LE(offset + 24)
  const local = data.readUInt32LE(offset + 42)
  validateCompression(flags, method)
  if (size > PRESENTATION_MAX_ENTRY_BYTES || local + 30 > directory) throw Error('Превышен лимит части ZIP')
  if (data.readUInt32LE(local) !== 0x04034b50) throw Error('Повреждённый ZIP local header')
  const body = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28)
  if (body + compressed > directory) throw Error('Некорректный диапазон ZIP')
  return { name: entryName(data, offset), size, crc: data.readUInt32LE(offset + 16) }
}
/** Rejects ambiguous or oversized archives before decompression or JSZip normalization. */
export function inspectZip(bytes: Uint8Array): ZipRecord[] {
  if (bytes.length < 22 || bytes.length > PRESENTATION_MAX_FILE_BYTES) throw Error('Недопустимый размер ZIP')
  const data = Buffer.from(bytes)
  const end = endOffset(data)
  if (data.readUInt32LE(end + 4) !== 0) throw Error('Многотомный ZIP запрещён')
  const count = data.readUInt16LE(end + 10)
  let offset = data.readUInt32LE(end + 16)
  const directory = offset
  if (count > PRESENTATION_MAX_ZIP_ENTRIES || offset + data.readUInt32LE(end + 12) !== end) throw Error('ZIP64 или неверный ZIP directory')
  const state = { records: [] as ZipRecord[], names: new Set<string>(), total: 0 }
  for (let index = 0; index < count; index++) {
    addRecord(state, validateEntry(data, offset, directory))
    offset += 46 + data.readUInt16LE(offset + 28) + data.readUInt16LE(offset + 30) + data.readUInt16LE(offset + 32)
  }
  if (offset !== end) throw Error('Неверное число частей ZIP')
  return state.records
}

function validateCompression(flags: number, method: number): void {
  if ((flags & 1) || ![0, 8].includes(method)) throw Error('Неподдержанный ZIP compression/encryption')
}
function addRecord(state: { records: ZipRecord[]; names: Set<string>; total: number }, record: ZipRecord): void {
  if (state.names.has(record.name)) throw Error('Повторяющееся имя ZIP')
  state.names.add(record.name)
  state.total += record.size
  if (state.total > PRESENTATION_MAX_EXPANDED_BYTES) throw Error('Превышен распакованный размер ZIP')
  state.records.push(record)
}
