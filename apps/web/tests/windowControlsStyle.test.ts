import assert from 'node:assert/strict';
import { test } from 'node:test';
import { desktopPlatform, drawnControls } from '../src/bridge/windowControlsStyle.ts';

test('the platform comes from the user agent', () => {
  assert.equal(desktopPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'windows');
  assert.equal(desktopPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'mac');
  assert.equal(desktopPlatform('Mozilla/5.0 (X11; Linux x86_64)'), 'linux');
});

test('automatic is the style of the platform', () => {
  assert.equal(drawnControls('auto', 'windows'), 'windows');
  assert.equal(drawnControls('auto', 'linux'), 'kde');
  assert.equal(drawnControls(undefined, 'linux'), 'kde');
});

test('an explicit style is drawn on Windows and Linux', () => {
  for (const platform of ['windows', 'linux'] as const) {
    assert.equal(drawnControls('windows', platform), 'windows');
    assert.equal(drawnControls('kde', platform), 'kde');
    assert.equal(drawnControls('mac', platform), 'mac');
  }
});

test('the system frame draws nothing', () => {
  assert.equal(drawnControls('system', 'windows'), null);
  assert.equal(drawnControls('system', 'linux'), null);
});

test('macOS keeps its native traffic lights', () => {
  for (const setting of ['auto', 'system', 'windows', 'kde', 'mac'] as const) {
    assert.equal(drawnControls(setting, 'mac'), null);
  }
});
