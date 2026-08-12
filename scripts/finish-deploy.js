/**
 * Finish deploy: read .env, push missing env to Vercel, migrate, set Telegram webhook.
 * Usage: node scripts/finish-deploy.js
 * Never prints secret values.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');

function loadEnv() {
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .forEach((line) => {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    });
  return out;
}

function vercelEnvAdd(name, value) {
  if (!value) return false;
  const r = spawnSync(
    'vercel',
    ['env', 'add', name, 'production', '--value', value, '--yes', '--force'],
    { cwd: root, encoding: 'utf8', shell: true }
  );
  console.log(name + ':', r.status === 0 ? 'ok' : 'fail');
  return r.status === 0;
}

async function main() {
  const env = loadEnv();
  const need = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'TELEGRAM_BOT_TOKEN'];
  const missing = need.filter((k) => !env[k]);
  if (missing.length) {
    console.error('Missing in .env:', missing.join(', '));
    console.error('Fill .env then re-run: node scripts/finish-deploy.js');
    process.exit(1);
  }

  vercelEnvAdd('TURSO_DATABASE_URL', env.TURSO_DATABASE_URL);
  vercelEnvAdd('TURSO_AUTH_TOKEN', env.TURSO_AUTH_TOKEN);
  vercelEnvAdd('TELEGRAM_BOT_TOKEN', env.TELEGRAM_BOT_TOKEN);
  if (env.TELEGRAM_SELLER_CHAT_ID) vercelEnvAdd('TELEGRAM_SELLER_CHAT_ID', env.TELEGRAM_SELLER_CHAT_ID);

  console.log('Redeploying…');
  const dep = spawnSync('vercel', ['deploy', '--prod', '--yes'], { cwd: root, encoding: 'utf8', shell: true });
  console.log(dep.status === 0 ? 'deploy ok' : 'deploy fail');

  const domain = 'https://youcansmile.vercel.app';
  const mig = await fetch(domain + '/api/migrate', { method: 'POST' });
  console.log('migrate', mig.status, await mig.text());

  const wh = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(domain + '/api/telegram/webhook')}`
  );
  console.log('telegram webhook', await wh.json());

  console.log('\nAdd in Google Cloud OAuth client:');
  console.log('  Origin:  ' + domain);
  console.log('  Redirect:' + domain + '/api/auth/google/callback');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
