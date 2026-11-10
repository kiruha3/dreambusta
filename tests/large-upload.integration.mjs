import assert from 'node:assert/strict';
const origin = process.env.WBOOK_ORIGIN || 'http://127.0.0.1:5173';
const text = 'Проверка размера книги. '.repeat(35000);
const form = new FormData();
form.append('file', new File([text], 'size-check.txt'));
form.append('document', JSON.stringify({title:'Проверка больших загрузок',author:'WBook',paragraphs:[text]}));
const response = await fetch(origin + '/api/books',{method:'POST',body:form});
assert.ok(response.ok, 'Large upload rejected: ' + response.status + ' ' + await response.text());
console.log('PASS: multipart upload larger than the default 1 MiB reaches the library API');
