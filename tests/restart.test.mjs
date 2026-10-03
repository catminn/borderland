// Restart the local server while pages are open: they must reconnect on their own and the game state must survive.
// Usage: node tests/restart.test.mjs   (expects `npm run dev` NOT to be running; it starts/stops wrangler itself)
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
const BASE = 'http://localhost:8787', sleep = ms => new Promise(r => setTimeout(r, ms));
const start = () => spawn('../node_modules/.bin/wrangler', ['dev', '-c', 'wrangler.dev.jsonc', '--port', '8787'], { cwd: new URL('../worker', import.meta.url).pathname, stdio: 'ignore', detached: true });
async function up() { for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/health')).ok) return; } catch { } await sleep(500); } throw new Error('server did not start'); }
const res = []; const T = (n, c) => res.push((c ? 'PASS ' : 'FAIL ') + n);
let srv = start(); await up();
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const p = await b.newPage();
await p.goto(BASE + '/?pin=' + (process.env.ADMIN_PIN || '888888')); await p.waitForSelector('#conn.free');
await p.click('[data-a=tab][data-v=ctrl]'); await p.click('[data-a=dd][data-v=coinTeam]'); await p.click('[data-a=pick][data-k=coinTeam][data-v=O]');
await p.fill('#cv', String(Math.floor(Math.random() * 9000) + 1000));
const score = (await p.locator('#coinbtn').innerText()).split('→').pop().trim(); await p.click('[data-a=setscore]'); await sleep(500);
process.kill(-srv.pid); await sleep(1500);
T('shows reconnecting while server is down', (await p.locator('#conn').innerText()).includes('重连'));
srv = start(); await up();
await p.waitForSelector('#conn.free', { timeout: 15000 }).catch(() => {});
T('reconnects by itself', (await p.locator('#conn').innerText()) === '已连接');
T('state survived restart', (await p.locator('.tbl').innerText()).includes(score));
console.log(res.join('\n')); await b.close(); process.kill(-srv.pid); process.exit(0);
