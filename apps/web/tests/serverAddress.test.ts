import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addressFromLink, isLocalHost } from '../src/app/pages/auth/serverAddress.ts';

test('a welcome link keeps the scheme it names', () => {
  assert.equal(addressFromLink('http://localhost:6167'), 'http://localhost:6167');
  assert.equal(addressFromLink('http://127.0.0.1:6167/'), 'http://127.0.0.1:6167/');
  assert.equal(addressFromLink('https://example.org:8448'), 'https://example.org:8448');
});

test('a percent-encoded scheme in the link is read as the scheme', () => {
  assert.equal(addressFromLink('http%3A%2F%2Flocalhost%3A6167'), 'http://localhost:6167');
  assert.equal(addressFromLink('https%3A%2F%2Fexample.org'), 'https://example.org');
});

test('a bare address on this machine or the local network is plain HTTP', () => {
  for (const address of [
    'localhost:6167',
    '127.0.0.1:6167',
    '10.0.2.2:6167',
    '172.16.0.5:6167',
    '172.31.255.1:6167',
    '192.168.1.20:6167',
    'mudrix.local:6167',
    '[::1]:6167',
  ]) {
    assert.equal(addressFromLink(address), `http://${address}`);
  }
  assert.equal(addressFromLink('localhost:6167/'), 'http://localhost:6167');
});

test('a name on the internet keeps the address box default (https)', () => {
  assert.equal(addressFromLink('matrix.org'), 'matrix.org');
  assert.equal(addressFromLink('example.org:8448'), 'example.org:8448');
  // Just outside the private ranges, so not a local test server.
  assert.equal(addressFromLink('172.32.0.1:6167'), '172.32.0.1:6167');
  assert.equal(addressFromLink('8.8.8.8'), '8.8.8.8');
});

test('an empty link is no server at all', () => {
  assert.equal(addressFromLink(''), '');
  assert.equal(addressFromLink('   '), '');
  assert.equal(addressFromLink(undefined), '');
  assert.equal(addressFromLink(null), '');
});

test('local hosts are loopback, private networks, mDNS names and ::1', () => {
  assert.equal(isLocalHost('localhost'), true);
  assert.equal(isLocalHost('[::1]'), true);
  assert.equal(isLocalHost('10.1.2.3'), true);
  assert.equal(isLocalHost('172.20.0.1'), true);
  assert.equal(isLocalHost('192.168.0.1'), true);
  assert.equal(isLocalHost('printer.local'), true);
  assert.equal(isLocalHost('example.org'), false);
  assert.equal(isLocalHost('172.15.0.1'), false);
  assert.equal(isLocalHost('172.32.0.1'), false);
  assert.equal(isLocalHost('192.169.0.1'), false);
  assert.equal(isLocalHost('11.0.0.1'), false);
});
