/**
 * Status bar indicator for Console.log Janitor.
 * Displays detected console.log count for the active file.
 */

import * as vscode from "vscode";
import { isSupportedLanguage } from "./config";
import { DiagnosticsManager } from "./diagnostics";

export class StatusBarManager {
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly diagnosticsManager: DiagnosticsManager;

  constructor(diagnosticsManager: DiagnosticsManager) {
    this.diagnosticsManager = diagnosticsManager;
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = "consoleLogJanitor.scanCurrentFile";
  }

  public update(editor?: vscode.TextEditor): void {
    const currentEditor = editor || vscode.window.activeTextEditor;

    if (!currentEditor || !isSupportedLanguage(currentEditor.document.languageId)) {
      this.statusBarItem.hide();
      return;
    }

    const matches = this.diagnosticsManager.getMatches(currentEditor.document.uri);
    const unsuppressed = matches.filter((m) => !m.isSuppressed);
    const count = unsuppressed.length;

    this.statusBarItem.text = `$(output) ${count} console.log`;
    this.statusBarItem.tooltip = `Console.log Janitor: ${count} statement${
      count === 1 ? "" : "s"
    } detected in active file. Click to re-scan.`;

    this.statusBarItem.show();
  }

  public hide(): void {
    this.statusBarItem.hide();
  }

  public dispose(): void {
    this.statusBarItem.dispose();
  }
}
