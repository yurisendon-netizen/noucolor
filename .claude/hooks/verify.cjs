#!/usr/bin/env node
// Stop hook: self-verification. Runs lint then build; blocks the stop with the
// failure output if either fails, so Claude sees it and can fix it before ending the turn.
const { execSync } = require('child_process');

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function run(cmd) {
  try {
    const output = execSync(cmd, { encoding: 'utf8', cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, output };
  } catch (e) {
    const output = `${e.stdout || ''}${e.stderr || ''}`;
    return { ok: false, output };
  }
}

const lint = run('npm run lint');
if (!lint.ok) {
  console.log(JSON.stringify({
    decision: 'block',
    reason: `El lint (npm run lint) falló:\n\n${lint.output.slice(-3000)}`,
  }));
  process.exit(0);
}

const build = run('npm run build');
if (!build.ok) {
  console.log(JSON.stringify({
    decision: 'block',
    reason: `El build (npm run build) falló:\n\n${build.output.slice(-3000)}`,
  }));
  process.exit(0);
}

console.log(JSON.stringify({ systemMessage: 'Auto-verificación: lint y build OK.' }));
process.exit(0);
