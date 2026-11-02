#!/usr/bin/env node
'use strict';
// Recovery tool. Run with the server stopped:  node scripts/reset-password.js <username> [newPassword]
const { createApp } = require('../lib/app');
const { hashPassword } = require('../lib/auth');
const { randomPassword } = require('../lib/util');

const [username, given] = process.argv.slice(2);
if (!username) { console.error('Usage: node scripts/reset-password.js <username> [newPassword]'); process.exit(2); }
if (given && given.length < 10) { console.error('Password must be at least 10 characters'); process.exit(2); }
const app = createApp();
const user = app.store.users.find((u) => u.username === username.toLowerCase());
if (!user) { console.error('No such user'); process.exit(1); }
const pw = given || randomPassword();
app.store.users.update(user.id, { passwordHash: hashPassword(pw), mustChange: true, disabled: false });
app.audit(null, 'user.reset_password', { type: 'user', id: user.id }, { username: user.username, via: 'command line on the server' }, 'ok', user.orgId);
app.store.flush();
console.log(`Password for ${user.username} set to: ${pw}\nThey must change it at next sign-in.`);
