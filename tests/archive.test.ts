import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { openArchive } from '../lib/formats/archive.ts';

test('stops actual ZIP output at the limit even when the central size is forged', async () => {
  const zip = new JSZip(); zip.file('huge.xhtml', 'x'.repeat(1024 * 1024));
  const bytes = await zip.generateAsync({type:'arraybuffer',compression:'DEFLATE'});
  const view = new DataView(bytes);
  for (let i=0;i<view.byteLength-28;i++) if(view.getUint32(i,true)===0x02014b50) view.setUint32(i+24,1,true);
  const archive = await openArchive(new File([bytes],'forged.epub'), 64 * 1024);
  await assert.rejects(() => archive.read(archive.file('huge.xhtml')!), /лимит распаковки/u);
});
