const assert = require('node:assert/strict');
const test = require('node:test');

const { verifyAdminAuth } = require('../lib/auth');

const encode = (username, password) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

test('default admin credentials are accepted', () => {
  const result = verifyAdminAuth({ headers: { authorization: encode('admin', 'admin') } });
  assert.ok(result.ok, 'admin/admin should authenticate successfully');
});

test('incorrect credentials are rejected', () => {
  const result = verifyAdminAuth({ headers: { authorization: encode('admin', 'wrong') } });
  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 401);
});

