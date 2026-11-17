import assert from 'node:assert/strict';
import { test } from 'node:test';
import { droppedFiles, hasDraggedFiles } from '../src/util/fileDrop.ts';

function file(name: string): File {
  return { name } as File;
}

function transfer({
  types = [],
  items = [],
  files = [],
}: {
  types?: string[];
  items?: DataTransferItem[];
  files?: File[];
}): DataTransfer {
  return { types, items, files } as unknown as DataTransfer;
}

function item(contents: File | null, directory = false): DataTransferItem {
  return {
    kind: 'file',
    getAsFile: () => contents,
    webkitGetAsEntry: () => ({ isDirectory: directory, isFile: !directory }),
  } as unknown as DataTransferItem;
}

test('only a drag coming with files counts as a file drop', () => {
  assert.equal(hasDraggedFiles(transfer({ types: ['Files'] })), true);
  assert.equal(hasDraggedFiles(transfer({ types: ['text/plain', 'text/html'] })), false);
  assert.equal(hasDraggedFiles(transfer({ items: [item(file('a.png'))] })), true);
  assert.equal(hasDraggedFiles(null), false);
});

test('a drop hands over every file it carries', () => {
  const files = droppedFiles(
    transfer({
      types: ['Files'],
      items: [item(file('a.png')), item(file('b.mp4'))],
    })
  );
  assert.deepEqual(
    files.map((f) => f.name),
    ['a.png', 'b.mp4']
  );
});

test('folders are skipped, like the picker cannot choose one', () => {
  const files = droppedFiles(
    transfer({
      types: ['Files'],
      items: [item(file('a.png')), item(file('folder'), true)],
    })
  );
  assert.deepEqual(
    files.map((f) => f.name),
    ['a.png']
  );
  assert.deepEqual(droppedFiles(transfer({ items: [item(file('folder'), true)] })), []);
});

test('a webview without items still reports its files', () => {
  const files = droppedFiles(transfer({ files: [file('a.png'), file('b.zip')] }));
  assert.deepEqual(
    files.map((f) => f.name),
    ['a.png', 'b.zip']
  );
});

test('nothing to drop is no files at all', () => {
  assert.deepEqual(droppedFiles(null), []);
  assert.deepEqual(droppedFiles(transfer({})), []);
});
