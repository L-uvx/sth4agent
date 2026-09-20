'use strict';

// Regression harness for the copy-path-lines extension.
//
// Runs in one node process and needs no VSCode: a mocked `vscode` module is
// injected, then the real extension.js is loaded and every selection shape is
// asserted against the exact clipboard payload.
//
//   node verify.js
//
// Works both from this source checkout and from the installed extension
// directory (%USERPROFILE%\.vscode\extensions\local.copy-path-lines-1.0.0).

const fs = require('fs');
const vm = require('vm');
const Module = require('module');

const EXTDIR = __dirname;
const EXT = `${EXTDIR}/extension.js`;

// Keep these fake paths POSIX-separated Windows-style on purpose: the point is
// to pin down separator normalisation in the output.
const ROOT = 'd:\\work\\demo-project';
const FILE = `${ROOT}\\src\\core\\store.cpp`;
const RELATIVE = 'src\\core\\store.cpp';

let failures = 0;
const section = (title) => console.log(`\n== ${title} ==`);
const expect = (ok, label, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    failures += 1;
    if (detail) {
      console.log(`      ${detail}`);
    }
  }
};

// --- static checks ---------------------------------------------------------

section('static checks');

try {
  new vm.Script(fs.readFileSync(EXT, 'utf8'), { filename: 'extension.js' });
  expect(true, 'extension.js parses as a script');
} catch (error) {
  expect(false, 'extension.js parses as a script', error.message);
}

let pkg = null;
try {
  pkg = JSON.parse(fs.readFileSync(`${EXTDIR}/package.json`, 'utf8'));
  expect(true, 'package.json parses as strict JSON');
} catch (error) {
  expect(false, 'package.json parses as strict JSON', error.message);
}

if (pkg) {
  const installed = `${pkg.publisher}.${pkg.name}-${pkg.version}`;
  expect(
    Boolean(pkg.publisher) && Boolean(pkg.name) && Boolean(pkg.version),
    `manifest declares publisher, name and version (${installed})`
  );

  const ids = (pkg.contributes?.commands ?? []).map((command) => command.command);
  expect(
    ids.join(',') === 'copyPathLines.copyRelative,copyPathLines.copyAbsolute',
    `manifest declares both commands (got ${ids.join(',')})`
  );

  const keys = (pkg.contributes?.keybindings ?? []).map((binding) => `${binding.key}:${binding.command}`);
  expect(
    keys.join(',') === 'ctrl+alt+r:copyPathLines.copyRelative,ctrl+alt+k:copyPathLines.copyAbsolute',
    `manifest declares both default keybindings (got ${keys.join(',')})`
  );

  const menuItems = (pkg.contributes?.menus?.['editor/context'] ?? []).map((item) => item.command);
  expect(
    menuItems.join(',') === 'copyPathLines.copyRelative,copyPathLines.copyAbsolute',
    `manifest declares both editor context menu entries (got ${menuItems.join(',')})`
  );

  expect(
    (pkg.extensionKind ?? []).includes('ui'),
    'manifest declares extensionKind ui (usable from a WSL/SSH remote window)'
  );

  // Accept both layouts: the source checkout (copy-path-lines/) and the
  // installed directory (local.copy-path-lines-1.0.0/).
  const dirName = EXTDIR.split(/[\\/]/).pop();
  if (dirName === installed) {
    expect(true, `installed layout (${installed}/)`);
  } else if (dirName === pkg.name) {
    expect(true, `source checkout layout (${pkg.name}/), installs as ${installed}`);
  } else {
    expect(false, `unexpected directory name ${dirName}`, `expected ${pkg.name} or ${installed}`);
  }
}

for (const file of ['extension.js', 'package.json']) {
  const head = fs.readFileSync(`${EXTDIR}/${file}`).subarray(0, 3);
  const hasBom = head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf;
  expect(!hasBom, `${file} has no BOM (first bytes ${Buffer.from(head).toString('hex')})`);
}

// --- behaviour checks ------------------------------------------------------

let clipboard = '';
let status = '';
let workspaceFolder = null;
let relative = null;
const commands = new Map();

const mockVscode = {
  workspace: {
    getWorkspaceFolder: () => workspaceFolder,
    asRelativePath: () => relative,
  },
  window: {
    activeTextEditor: null,
    setStatusBarMessage: (message) => {
      status = message;
    },
  },
  env: {
    clipboard: {
      writeText: async (text) => {
        clipboard = text;
      },
    },
  },
  commands: {
    registerCommand: (id, callback) => {
      commands.set(id, callback);
      return { dispose() {} };
    },
  },
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

section('behaviour');
require(EXT).activate({ subscriptions: { push() {} } });

// VSCode normalises Selection.start/end to min/max, so the mock does too.
const sel = (startLine, startChar, endLine, endChar) => ({
  start: { line: startLine, character: startChar },
  end: { line: endLine, character: endChar },
});

const file = (fsPath, scheme = 'file') => ({ uri: { scheme, fsPath }, fileName: fsPath });
const code = file(FILE);

async function check(label, expected, command, document, selections) {
  mockVscode.window.activeTextEditor = { document, selections };
  clipboard = '';
  await commands.get(command)();
  expect(
    clipboard === expected,
    label,
    `expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(clipboard)}`
  );
}

(async () => {
  workspaceFolder = { uri: { fsPath: ROOT } };
  relative = RELATIVE;

  await check('caret only -> single line anchor', 'src/core/store.cpp#L42', 'copyPathLines.copyRelative', code, [sel(41, 5, 41, 5)]);
  await check('multi-line selection -> range anchor', 'src/core/store.cpp#L42-L58', 'copyPathLines.copyRelative', code, [sel(41, 0, 57, 10)]);
  await check(
    'selection ending at column 0 does not add a line',
    'src/core/store.cpp#L42-L58',
    'copyPathLines.copyRelative',
    code,
    [sel(41, 0, 58, 0)]
  );
  await check('single-line selection stays single', 'src/core/store.cpp#L42', 'copyPathLines.copyRelative', code, [sel(41, 0, 41, 12)]);
  await check('first line of file', 'src/core/store.cpp#L1', 'copyPathLines.copyRelative', code, [sel(0, 0, 0, 0)]);
  await check(
    'multi cursor -> one reference per line',
    'src/core/store.cpp#L42\nsrc/core/store.cpp#L2-L4',
    'copyPathLines.copyRelative',
    code,
    [sel(41, 0, 41, 12), sel(1, 0, 3, 4)]
  );
  await check(
    'duplicate selections collapse',
    'src/core/store.cpp#L42',
    'copyPathLines.copyRelative',
    code,
    [sel(41, 0, 41, 2), sel(41, 0, 41, 2)]
  );
  await check(
    'absolute command normalises separators and drive letter',
    'D:/work/demo-project/src/core/store.cpp#L42-L58',
    'copyPathLines.copyAbsolute',
    code,
    [sel(41, 0, 57, 10)]
  );

  workspaceFolder = null;
  await check(
    'no workspace folder -> absolute fallback',
    'D:/work/demo-project/src/core/store.cpp#L1',
    'copyPathLines.copyRelative',
    code,
    [sel(0, 0, 0, 0)]
  );
  await check('untitled buffer', 'Untitled-1#L3-L4', 'copyPathLines.copyRelative', file('Untitled-1', 'untitled'), [sel(2, 0, 4, 0)]);

  console.log(`\nstatus bar sample: ${status}`);
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error('HARNESS ERROR:', error.stack);
  process.exit(1);
});
