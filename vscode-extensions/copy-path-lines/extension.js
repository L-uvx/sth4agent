'use strict';

const vscode = require('vscode');

/** Keep Windows separators out of the output: d:\a\b.cpp -> d:/a/b.cpp */
function toPosix(value) {
  return value.replace(/\\/g, '/');
}

/** Uppercase a drive letter for readability: d:/a -> D:/a */
function normaliseDrive(value) {
  return value.replace(/^([a-z]):/, (_, drive) => `${drive.toUpperCase()}:`);
}

/** Absolute label for the document. Untitled buffers have no fsPath. */
function absoluteLabel(document) {
  if (document.uri.scheme === 'untitled') {
    return document.fileName;
  }
  return normaliseDrive(toPosix(document.uri.fsPath));
}

/**
 * Workspace-relative label. asRelativePath is used instead of a hand-rolled
 * path.relative() so remote (WSL / SSH / container) URIs keep working when the
 * extension runs on the UI side. Outside a workspace it degrades to a full path.
 */
function relativeLabel(document) {
  if (!vscode.workspace.getWorkspaceFolder(document.uri)) {
    return absoluteLabel(document);
  }
  return toPosix(vscode.workspace.asRelativePath(document.uri, false));
}

/** `#L42` for a single line, `#L42-L58` for a range. */
function anchor(selection) {
  const from = selection.start.line + 1;
  let to = selection.end.line + 1;
  if (to > from && selection.end.character === 0) {
    // Selections are end-exclusive: ending at column 0 of the next line does
    // not actually include that line.
    to -= 1;
  }
  return from === to ? `#L${from}` : `#L${from}-L${to}`;
}

/** One reference per selection, order preserved, duplicates removed. */
function references(editor, absolute) {
  const label = absolute ? absoluteLabel(editor.document) : relativeLabel(editor.document);
  const seen = new Set();
  const lines = [];
  for (const selection of editor.selections) {
    const line = `${label}${anchor(selection)}`;
    if (!seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  }
  return lines;
}

async function copy(absolute) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const lines = references(editor, absolute);
  await vscode.env.clipboard.writeText(lines.join('\n'));
  const summary = lines.length === 1 ? lines[0] : `${lines.length} references`;
  vscode.window.setStatusBarMessage(`$(clippy) ${summary}`, 3000);
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('copyPathLines.copyRelative', () => copy(false)),
    vscode.commands.registerCommand('copyPathLines.copyAbsolute', () => copy(true))
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
