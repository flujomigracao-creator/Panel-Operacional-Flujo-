import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
test('CAPI only claims pending or failed events and marks sent after Meta accepts them', () => {
assert.match(source, /in\('status', \['pending', 'failed'\]\)/); assert.match(source, /status: 'sending'/); assert.match(source, /if \(!res\.ok \|\| response\.error\) throw/); assert.match(source, /status: 'sent'/); assert.match(source, /status: 'failed'/);
});
test('CAPI credentials stay server-side and personal identifiers are hashed', () => {
assert.match(source, /Deno\.env\.get\('META_ADS_TOKEN'\)/); assert.match(source, /crypto\.subtle\.digest\('SHA-256'/); assert.match(source, /x-meta-capi-secret/);
});
