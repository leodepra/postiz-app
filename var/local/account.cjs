'use strict';
// Run inside the backend container with its bootstrap and an interactive TTY.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const readline = require('node:readline/promises');
const { randomBytes } = require('node:crypto');
function password() {
  if (!process.stdin.isTTY) throw new Error('An interactive terminal is required');
  process.stdout.write('Password (16–72 bytes; input hidden): ');
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = data => {
      for (const char of data.toString('utf8')) {
        if (char === '\u0003') { finish(); reject(new Error('Cancelled')); return; }
        if (char === '\r' || char === '\n') { finish(); resolve(value); return; }
        if (char === '\u007f' || char === '\b') value = Array.from(value).slice(0,-1).join('');
        else if (char >= ' ') value += char;
      }
    };
    function finish() { process.stdin.off('data', onData); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); }
    process.stdin.on('data', onData);
  });
}
async function main() {
  if (process.env.POSTIZ_LOCAL_ONLY !== 'true') throw new Error('Local profile required');
  const mode = process.argv[2];
  if (!['create','recover','create-generated'].includes(mode)) throw new Error('Usage: account.cjs create|recover|create-generated');
  let email;
  if (mode === 'create-generated') {
    email = 'local@postiz.invalid';
  } else {
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    email = (await prompt.question('Local account email (not sent externally): ')).trim().toLowerCase();
    prompt.close();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email');
  const value = mode === 'create-generated' ? randomBytes(32).toString('base64url') : await password();
  if (value.length < 16 || Buffer.byteLength(value, 'utf8') > 72) throw new Error('Password must have at least 16 characters and at most 72 UTF-8 bytes');
  if (mode !== 'create-generated') {
    const confirmation = await password();
    if (value !== confirmation) throw new Error('Passwords do not match');
  }
  const hash = await bcrypt.hash(value, 12);
  const db = new PrismaClient();
  try {
    await db.$transaction(async tx => {
      // Serializes create/recover even if two local consoles run concurrently.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(71638294)`;
      const users = await tx.user.findMany({ select: { id: true, email: true, providerName: true } });
      if (mode === 'create' || mode === 'create-generated') {
        if (users.length || await tx.organization.count()) throw new Error('Database is not empty; refusing to create another account');
        await tx.organization.create({ data: {
          name: 'Local', apiKey: randomBytes(32).toString('hex'),
          users: { create: { role: 'SUPERADMIN', user: { create: {
            email, password: hash, providerName: 'LOCAL', timezone: 0, activated: true,
            isSuperAdmin: false, sendSuccessEmails: false, sendFailureEmails: false, sendStreakEmails: false,
          } } } },
        } });
      } else {
        if (users.length !== 1 || users[0].email !== email || users[0].providerName !== 'LOCAL') throw new Error('Recovery requires the sole local account');
        await tx.user.update({ where: { id: users[0].id }, data: { password: hash, activated: true } });
      }
    });
    if (mode === 'create-generated') {
      console.log(`Local account created.\nLogin: ${email}\nPassword: ${value}`);
    } else {
      console.log(mode === 'create' ? 'Local account created.' : 'Password changed. Previous sessions are invalid.');
    }
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('Account command failed. Check mode, empty database, email and password requirements; no secret has been printed.'); process.exitCode = 1; });
