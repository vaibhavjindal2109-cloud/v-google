// One command to run everything: installs missing dependencies, creates backend/.env if needed,
// then starts the API (port 3001) and the website (port 5173) together.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 20 || (maj === 20 && min < 6)) {
  console.error(`Node ${process.versions.node} is too old. Install Node 20.6 or newer from nodejs.org, then run again.`);
  process.exit(1);
}

const envFile = path.join(root, 'backend', '.env');
if (!existsSync(envFile)) {
  copyFileSync(path.join(root, 'backend', '.env.example'), envFile);
  console.log('Created backend/.env. Paste your SERPAPI_KEY into it to enable live web search, then restart.');
}

for (const dir of ['backend', 'frontend']) {
  if (existsSync(path.join(root, dir, 'node_modules'))) continue;
  console.log(`Installing ${dir} dependencies (first run only)...`);
  const r = spawnSync('npm', ['install'], { cwd: path.join(root, dir), stdio: 'inherit', shell: win });
  if (r.status !== 0) { console.error(`npm install failed in ${dir}.`); process.exit(r.status || 1); }
}

let closing = false;
const procs = [];
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  procs.forEach((p) => p.kill());
  setTimeout(() => process.exit(code), 300);
}
function start(name, color, dir) {
  const p = spawn('npm', ['run', 'dev'], { cwd: path.join(root, dir), shell: win });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => stream.on('data', (d) => out.write(String(d).split('\n').filter(Boolean).map((l) => tag + l).join('\n') + '\n'));
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stderr);
  p.on('exit', (code) => { console.log(`${tag}stopped`); shutdown(code || 0); });
  procs.push(p);
}

start('api', 32, 'backend');
start('web', 36, 'frontend');
setTimeout(() => console.log('\n  V-Google is starting. Open http://localhost:5173\n  Press Ctrl+C to stop both servers.\n'), 1500);
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
