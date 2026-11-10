import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, basename } from 'node:path';
const exec = promisify(execFile);
export async function convertDoc(input: string, dir: string) {
  const binary = process.env.LIBREOFFICE_PATH || (process.platform === 'win32' ? 'C:/Program Files/LibreOffice/program/soffice.exe' : 'soffice');
  const profile = join(dir, 'lo-profile');
  try {
    await exec(binary, [`-env:UserInstallation=${pathToFileURL(profile).href}`, '--headless', '--norestore', '--nodefault', '--nolockcheck', '--convert-to', 'docx:Office Open XML Text', '--outdir', dir, input], { timeout: 90000, maxBuffer: 1024 * 1024, windowsHide: true });
    const output = join(dir, basename(input).replace(/\.doc$/i, '.docx'));
    if (!existsSync(output)) throw new Error('Не получен DOCX'); return output;
  } catch { throw new Error('Старый DOC требует LibreOffice. Установите его и задайте LIBREOFFICE_PATH либо загрузите DOCX.'); }
  finally { rmSync(profile, { recursive: true, force: true }); }
}
