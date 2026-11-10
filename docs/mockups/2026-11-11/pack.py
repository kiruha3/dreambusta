"""Package the static design handoff with working relative links; never overwrite."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json

root = Path(__file__).resolve().parent
docs = root.parents[1]
archive = root.parent / 'dreambusta-design-v1-2026-11-11.zip'
files = sorted(p for p in root.rglob('*') if p.is_file() and '__pycache__' not in p.parts)
files += [docs / 'superpowers/specs/2026-11-11-dreambusta-library-design.md',
          docs / 'superpowers/specs/2026-11-11-dreambusta-screens-design.md']
with ZipFile(archive, 'x', compression=ZIP_DEFLATED) as output:
    output.writestr('README.txt', 'DreamBusta design V1. Open mockups/2026-11-11/index.html.\n30 PNG + static HTML, requirements and screen design. No working application is included.\n')
    for source in files:
        output.write(source, source.relative_to(docs).as_posix())
with ZipFile(archive) as saved:
    assert saved.testzip() is None
    assert len([p for p in saved.namelist() if '/png/' in p and p.endswith('.png')]) == 30
    entries = len(saved.namelist())
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix('.zip.sha256').write_text(digest + '  ' + archive.name + '\n', encoding='utf-8')
print(json.dumps({'archive': str(archive), 'entries': entries, 'MiB': round(archive.stat().st_size / 1048576, 2), 'zipIntegrity': 'PASS', 'sha256': digest}, ensure_ascii=False))
