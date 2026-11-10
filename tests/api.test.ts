import test from 'node:test';
import assert from 'node:assert/strict';
import { readApiResponse } from '../lib/api.ts';
test('an upstream plain-text 413 becomes a useful upload error', async () => {
  await assert.rejects(readApiResponse(new Response('Payload Too Large', {status:413})), /размер|25 МБ/u);
});
test('preserves a useful JSON API error', async () => {
  await assert.rejects(readApiResponse(Response.json({error:'В файле нет текста.'},{status:400})), /нет текста/u);
});
