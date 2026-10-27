import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError, asObject, difficulty, displayName, end, roomCode, tileIdField, version } from './index.js';

test('validators accept good payloads and reject bad ones', () => {
  assert.equal(roomCode(' ab2cd '), 'AB2CD');
  for (const bad of ['', 'ABCD', 'ABCDEF', 'AB0CD', 'ABIOD', 42, null]) assert.throws(() => roomCode(bad), ValidationError);
  assert.equal(displayName('  سامي  '), 'سامي');
  assert.equal(displayName('<script>x'), 'scriptx');
  assert.equal(displayName(''), 'Player');
  assert.equal(displayName('x'.repeat(50)).length, 20);
  assert.equal(difficulty('expert'), 'expert');
  assert.throws(() => difficulty('god'), ValidationError);
  assert.equal(version(3), 3);
  for (const bad of [-1, 1.5, '3', undefined]) assert.throws(() => version(bad), ValidationError);
  assert.equal(end('left'), 'left');
  assert.throws(() => end('top'), ValidationError);
  assert.equal(tileIdField('3-5'), '3-5');
  assert.throws(() => tileIdField('7-1'), ValidationError);
  assert.deepEqual(asObject(undefined), {});
  assert.throws(() => asObject([1]), ValidationError);
  assert.throws(() => asObject('x'), ValidationError);
});
