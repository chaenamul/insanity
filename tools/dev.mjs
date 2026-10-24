// npm run dev — API 서버(server/, 코드가 바뀌면 재시작)와 Vite(화면)를 함께 실행한다.
import { spawn } from 'node:child_process';

const procs = [
  { name: 'api', color: 36, cmd: 'npx tsx watch --clear-screen=false server/index.ts' },
  { name: 'web', color: 35, cmd: 'npx vite' },
];

const children = procs.map(({ name, color, cmd }) => {
  const child = spawn(cmd, { shell: true, stdio: ['inherit', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '1' } });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}종료 (${code ?? 'signal'})`);
    shutdown(code ?? 0);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
