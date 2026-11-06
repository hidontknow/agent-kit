'use strict';
/**
 * Link-only CLI tools (clis/<name>.json). Nothing is vendored into this repo: the manifest records
 * where the tool lives and how to install it, and `agent-kit install cli/<name>` delegates to a
 * package manager. Install is recorded as an "exec" action so `uninstall` can reverse it.
 */
const { spawnSync } = require('child_process');
const { which } = require('./util');

/** Package managers: how to install / uninstall a package, and the binary that must be present. */
const MANAGERS = {
  uv: { bin: 'uv', install: (p) => ['uv', 'tool', 'install', p], uninstall: (p) => ['uv', 'tool', 'uninstall', p], uninstallName: true },
  pipx: { bin: 'pipx', install: (p) => ['pipx', 'install', p], uninstall: (p) => ['pipx', 'uninstall', p], uninstallName: true },
  pip: { bin: 'python3', install: (p) => ['python3', '-m', 'pip', 'install', '--user', p], uninstall: (p) => ['python3', '-m', 'pip', 'uninstall', '-y', p], uninstallName: true },
  npm: { bin: 'npm', install: (p) => ['npm', 'install', '-g', p], uninstall: (p) => ['npm', 'uninstall', '-g', p], uninstallName: true },
  brew: { bin: 'brew', install: (p) => ['brew', 'install', p], uninstall: (p) => ['brew', 'uninstall', p], uninstallName: true },
  cargo: { bin: 'cargo', install: (p) => ['cargo', 'install', p], uninstall: (p) => ['cargo', 'uninstall', p], uninstallName: true },
  go: { bin: 'go', install: (p) => ['go', 'install', p.includes('@') ? p : `${p}@latest`], uninstall: null },
};

/** Strip a version pin for uninstall: "pkg==1.2" / "pkg@1.2" / "@scope/pkg@1.2" → name. */
function packageName(manager, pkg) {
  if (['uv', 'pipx', 'pip'].includes(manager)) return pkg.split(/[=<>!~;[ ]/)[0];
  if (manager === 'npm') return pkg.replace(/(.)@[^/]*$/, '$1');
  if (manager === 'cargo') return pkg.split('@')[0];
  return pkg;
}

function validateCli(meta) {
  const errs = [];
  if (!meta.repo && !meta.homepage) errs.push('needs "repo" or "homepage"');
  for (const k of ['repo', 'homepage', 'docs']) if (meta[k] && !/^https?:\/\//.test(meta[k])) errs.push(`"${k}" must be an http(s) URL`);
  if (!meta.bin) errs.push('missing "bin" (the command the tool provides)');
  if (!Array.isArray(meta.install) || !meta.install.length) errs.push('"install" must list at least one { manager, package }');
  for (const m of meta.install || []) {
    if (!MANAGERS[m.manager]) errs.push(`unknown manager "${m.manager}" (known: ${Object.keys(MANAGERS).join(', ')})`);
    if (!m.package) errs.push(`install entry for ${m.manager} needs "package"`);
  }
  if (meta.notes && !Array.isArray(meta.notes)) errs.push('"notes" must be a list of strings');
  return errs;
}

/** Pick the first install method whose package manager is available (or the one named by --via). */
function pickMethod(meta, via) {
  const methods = meta.install || [];
  if (via) {
    const m = methods.find((x) => x.manager === via);
    if (!m) throw new Error(`${meta.name} has no "${via}" install method (available: ${methods.map((x) => x.manager).join(', ')})`);
    return m;
  }
  return methods.find((m) => MANAGERS[m.manager] && which(MANAGERS[m.manager].bin)) || null;
}

function run(cmd) {
  const r = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit' });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`\`${cmd.join(' ')}\` exited with ${r.status}`);
}

/** Install a CLI item; returns undo actions. */
function installCli(item, ctx, opts = {}) {
  const meta = item.meta;
  const existing = which(meta.bin);
  if (existing && !opts.force) {
    ctx.notes.push(`${item.id}: \`${meta.bin}\` is already on PATH (${existing}) — skipped. Use --force to install anyway.`);
    for (const n of meta.notes || []) ctx.notes.push(`${item.id}: ${n}`);
    return [];
  }
  const method = pickMethod(meta, opts.via);
  if (!method) {
    const how = (meta.install || []).map((m) => `${MANAGERS[m.manager] ? MANAGERS[m.manager].install(m.package).join(' ') : m.manager}`).join('\n    ');
    throw Object.assign(new Error(`no supported package manager found. Install one of them, or run manually:\n    ${how}`), { unsupported: true });
  }
  const mgr = MANAGERS[method.manager];
  const cmd = mgr.install(method.package);
  if (ctx.dryRun) ctx.notes.push(`would run: ${cmd.join(' ')}`);
  else run(cmd);
  for (const n of meta.notes || []) ctx.notes.push(`${item.id}: ${n}`);
  if (!mgr.uninstall) {
    ctx.notes.push(`${item.id}: ${method.manager} has no uninstall command — remove \`${meta.bin}\` manually if needed.`);
    return [{ kind: 'note', text: `installed with ${cmd.join(' ')}` }];
  }
  return [{ kind: 'exec', cmd: mgr.uninstall(packageName(method.manager, method.package)), label: `${method.manager} ${method.package}` }];
}

module.exports = { MANAGERS, validateCli, pickMethod, installCli, packageName };
