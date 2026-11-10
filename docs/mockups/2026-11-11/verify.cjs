const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict');
const sharp=require('sharp');
const {screens}=require('./screens.cjs');
const root=__dirname,utf8=new TextDecoder('utf-8',{fatal:true});
function read(p){return utf8.decode(fs.readFileSync(p))}
async function main(){assert.equal(screens.length,30);const report=JSON.parse(read(path.join(root,'verification.json')));assert.equal(report.screens.length,30);assert.equal(report.gallery.navCount,30);assert.equal(report.gallery.active,'21');for(const s of screens){const name=s.id+'-'+s.slug;const html=read(path.join(root,'screens',name+'.html'));assert(html.includes('<html lang="ru">'));const image=await sharp(path.join(root,'png',name+'.png')).metadata();assert.equal(image.width,s.width);assert.equal(image.height,s.height);const r=report.screens.find(x=>x.id===s.id);assert(r.fontReady);assert.equal(r.documentWidth,r.viewportWidth);assert.equal(r.horizontalOverflow.length,0);assert.equal(r.pageErrors.length,0);for(const m of html.matchAll(/\/(?:library|collections)\/[a-z0-9-]+/g))assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/.test(m[0]),m[0]);}
const load=id=>read(path.join(root,'screens',screens.find(x=>x.id===id).id+'-'+screens.find(x=>x.id===id).slug+'.html'));
assert(load('20').includes('Сохранённая версия доступна'));
assert(load('20').includes('Оставить версию'));
assert(load('20').includes('Завершить обновление'));
assert(load('20').includes('С чего начать'));
assert(load('22').includes('Текстовый слой не найден'));
assert(load('22').includes('disabled aria-label="search"'));
assert(load('11').includes('Опубликованная расшифровка'));
assert(load('11').includes('Скорочтение'));
assert(load('10').includes('Расшифровка не опубликована'));
assert(load('09').includes('Статические слайды'));
assert(load('05').includes('Только просмотр'));
assert(load('29').includes('Buildin Developer Guide'));
assert(load('30').includes('https://library.example.org/library/komandnaya-rabota-s-dokumentami'));
const docs=[path.join(root,'README.md'),path.join(root,'review.md'),path.join(root,'research','buildin-review.md'),path.resolve(root,'../../superpowers/specs/2026-11-11-dreambusta-library-design.md'),path.resolve(root,'../../superpowers/specs/2026-11-11-dreambusta-screens-design.md')];let links=0;for(const doc of docs){const text=read(doc);for(const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const target=match[1];if(!/^(https?:|#)/.test(target)){assert(fs.existsSync(path.resolve(path.dirname(doc),target)),doc+' -> '+target);links++;}}}
const spec=read(docs[3]);assert(spec.includes('Редакция 9'));assert(!spec.includes('Перед каждым открытием повторно проверяется доступ'));assert(spec.includes('### 6.5. Публичные страницы Buildin'));assert(spec.includes('### 7.1. Читаемые постоянные ссылки'));
console.log(JSON.stringify({pngFiles:screens.length,pngDimensions:'PASS',utf8:'PASS',localLinks:links,screenRules:'PASS',layout:'PASS',gallery:'PASS'},null,2));}
main().catch(e=>{console.error(e);process.exitCode=1});
