import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aboutUpdateLabel, barPercent } from '../src/app/components/UpdateButton/updateProgress.ts';

test('the bar is empty while the size is unknown', () => {
  assert.equal(barPercent(null), 0);
  assert.equal(barPercent(undefined), 0);
  assert.equal(barPercent(Number.NaN), 0);
});

test('the bar follows the download and never leaves 0-100', () => {
  assert.equal(barPercent(0), 0);
  assert.equal(barPercent(42), 42);
  assert.equal(barPercent(100), 100);
  assert.equal(barPercent(120), 100);
  assert.equal(barPercent(-5), 0);
  assert.equal(barPercent(12.6), 13);
});

test('a download in progress labels the button before the spinner', () => {
  assert.equal(
    aboutUpdateLabel({ checking: true, upToDate: false, percent: 37, ready: false }),
    'downloading'
  );
});

test('without a percent the button says it is checking, then offers a check', () => {
  assert.equal(
    aboutUpdateLabel({ checking: true, upToDate: false, percent: null, ready: false }),
    'checking'
  );
  assert.equal(
    aboutUpdateLabel({ checking: false, upToDate: false, percent: null, ready: false }),
    'checkNow'
  );
});

test('a finished download stops the progress label', () => {
  assert.equal(
    aboutUpdateLabel({ checking: true, upToDate: false, percent: 100, ready: true }),
    'checking'
  );
});

test('being up to date wins over everything else', () => {
  assert.equal(
    aboutUpdateLabel({ checking: true, upToDate: true, percent: 10, ready: false }),
    'upToDate'
  );
});
