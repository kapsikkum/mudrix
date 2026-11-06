import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateManifest } from '../src/app/features/integrations/manifest.ts';
import { runBehaviourExamples } from './integrationBehaviourFixtures.ts';
import { runManifestExamples } from './integrationManifestFixtures.ts';
import { runSignatureExamples } from './integrationSignatureFixtures.ts';

test('the manifest validator, permission rules and matching hold on every fixture', () => {
  assert.deepEqual(runManifestExamples(), []);
});

test('updates, link matching, link details and settings hold on every fixture', () => {
  assert.deepEqual(runBehaviourExamples(), []);
});

test('repository signatures, key pinning and rollback protection hold on every fixture', async () => {
  assert.deepEqual(await runSignatureExamples(), []);
});

test('the sample repository fixture is a valid manifest', () => {
  const text = readFileSync(new URL('./fixtures/integrations-repo.json', import.meta.url), 'utf8');
  const res = validateManifest(JSON.parse(text));
  assert.equal(res.ok, true);
  assert.equal(res.ok && res.value.rejected.length, 0);
  assert.equal(res.ok && res.value.integrations.length, 1);
});
