/**
 * Console.log Janitor - Extension Entry Point
 */

import * as vscode from "vscode";
import { ConsoleLogCodeActionProvider } from "./codeActions";
import { registerCommands } from "./commands";
import { getConfig, isSupportedLanguage, SUPPORTED_LANGUAGES } from "./config";
import { ConsoleLogHoverProvider, DiagnosticsManager } from "./diagnostics";
import { StatusBarManager } from "./statusBar";

let diagnosticsManager: DiagnosticsManager | undefined;
let statusBarManager: StatusBarManager | undefined;
const debounceTimers = new Map<string, NodeJS.Timeout>();

export function activate(context: vscode.ExtensionContext): void {
  diagnosticsManager = new DiagnosticsManager();
  statusBarManager = new StatusBarManager(diagnosticsManager);

  context.subscriptions.push(diagnosticsManager.getCollection());
  context.subscriptions.push(statusBarManager);

  // Document selectors for supported languages
  const documentSelectors: vscode.DocumentFilter[] = SUPPORTED_LANGUAGES.map((lang) => ({
    language: lang,
    scheme: "file",
  }));
  // Also support untitled documents (e.g. scratch files)
  const untitledSelectors: vscode.DocumentFilter[] = SUPPORTED_LANGUAGES.map((lang) => ({
    language: lang,
    scheme: "untitled",
  }));
  const allSelectors = [...documentSelectors, ...untitledSelectors];

  // Register Code Actions provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      allSelectors,
      new ConsoleLogCodeActionProvider(diagnosticsManager),
      {
        providedCodeActionKinds: ConsoleLogCodeActionProvider.providedCodeActionKinds,
      }
    )
  );

  // Register Hover provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      allSelectors,
      new ConsoleLogHoverProvider(diagnosticsManager)
    )
  );

  // Register commands
  registerCommands(context, diagnosticsManager, statusBarManager);

  // Helper to scan a document safely
  const scanDocument = (doc: vscode.TextDocument) => {
    if (!diagnosticsManager || !statusBarManager) return;
    if (!isSupportedLanguage(doc.languageId)) return;

    diagnosticsManager.updateDiagnostics(doc);
    if (vscode.window.activeTextEditor?.document.uri.toString() === doc.uri.toString()) {
      statusBarManager.update(vscode.window.activeTextEditor);
    }
  };

  // Helper to cancel debounce timer for a URI
  const clearDebounce = (uriStr: string) => {
    const timer = debounceTimers.get(uriStr);
    if (timer) {
      clearTimeout(timer);
      debounceTimers.delete(uriStr);
    }
  };

  // 1. Scan on Open
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      const config = getConfig();
      if (config.enabled && config.scanOnOpen) {
        scanDocument(doc);
      }
    })
  );

  // 2. Scan on Change (Debounced)
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const config = getConfig();
      if (!config.enabled || !config.scanOnChange) return;
      if (!isSupportedLanguage(e.document.languageId)) return;

      const uriStr = e.document.uri.toString();
      clearDebounce(uriStr);

      const timer = setTimeout(() => {
        debounceTimers.delete(uriStr);
        scanDocument(e.document);
      }, config.debounceDelayMs);

      debounceTimers.set(uriStr, timer);
    })
  );

  // 3. Scan on Save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const config = getConfig();
      if (config.enabled && config.scanOnSave) {
        clearDebounce(doc.uri.toString());
        scanDocument(doc);
      }
    })
  );

  // 4. Clean up on Document Close
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      clearDebounce(doc.uri.toString());
      diagnosticsManager?.clearDocument(doc.uri);
      statusBarManager?.update();
    })
  );

  // 5. Active Editor Switch
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        const config = getConfig();
        if (config.enabled && isSupportedLanguage(editor.document.languageId)) {
          scanDocument(editor.document);
        }
      }
      statusBarManager?.update(editor);
    })
  );

  // 6. Configuration Change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("consoleLogJanitor")) {
        const config = getConfig();
        if (!config.enabled) {
          diagnosticsManager?.clearAll();
          statusBarManager?.hide();
        } else {
          // Re-scan all visible editors
          for (const editor of vscode.window.visibleTextEditors) {
            scanDocument(editor.document);
          }
          statusBarManager?.update();
        }
      }
    })
  );

  // Initial scan of any already-open visible documents
  for (const editor of vscode.window.visibleTextEditors) {
    scanDocument(editor.document);
  }
  statusBarManager.update();
}

export function deactivate(): void {
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();

  if (diagnosticsManager) {
    diagnosticsManager.dispose();
    diagnosticsManager = undefined;
  }

  if (statusBarManager) {
    statusBarManager.dispose();
    statusBarManager = undefined;
  }
}
