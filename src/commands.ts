/**
 * Manual commands contributed to the VS Code Command Palette and Quick Fix actions.
 */

import * as vscode from "vscode";
import { removeAllInFile, removeAllInWorkspace } from "./bulkCleaner";
import { isSupportedLanguage, isWorkspaceCleanableFile } from "./config";
import { DiagnosticsManager } from "./diagnostics";
import { StatusBarManager } from "./statusBar";

export function registerCommands(
  context: vscode.ExtensionContext,
  diagnosticsManager: DiagnosticsManager,
  statusBarManager: StatusBarManager
): void {
  // 1. Scan Current File
  context.subscriptions.push(
    vscode.commands.registerCommand("consoleLogJanitor.scanCurrentFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("Console.log Janitor: No active file to scan.");
        return;
      }

      if (!isSupportedLanguage(editor.document.languageId)) {
        vscode.window.showInformationMessage(
          `Console.log Janitor: File type '${editor.document.languageId}' is not supported. Supported types: JavaScript, TypeScript, JSX, TSX.`
        );
        return;
      }

      const matches = diagnosticsManager.updateDiagnostics(editor.document);
      statusBarManager.update(editor);

      const count = matches.length;
      if (count === 0) {
        vscode.window.showInformationMessage("Console.log Janitor: No console.log statements found.");
      } else {
        vscode.window.showInformationMessage(
          `Console.log Janitor: Found ${count} console.log statement${count === 1 ? "" : "s"}.`
        );
      }
    })
  );

  // 2. Scan Workspace
  context.subscriptions.push(
    vscode.commands.registerCommand("consoleLogJanitor.scanWorkspace", async () => {
      const rawFiles = await vscode.workspace.findFiles(
        "**/*.{js,ts,jsx,tsx}",
        "**/{node_modules,.git,dist,out,build,coverage}/**"
      );

      const files = rawFiles.filter((f) => isWorkspaceCleanableFile(f));

      if (files.length === 0) {
        vscode.window.showInformationMessage("Console.log Janitor: No JavaScript/TypeScript files found in workspace.");
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Console.log Janitor: Scanning workspace...",
          cancellable: true,
        },
        async (progress, token) => {
          let totalStatements = 0;
          let filesWithLogs = 0;

          for (let i = 0; i < files.length; i++) {
            if (token.isCancellationRequested) break;

            const file = files[i];
            progress.report({
              message: `${i + 1}/${files.length} files`,
              increment: (1 / files.length) * 100,
            });

            try {
              const doc = await vscode.workspace.openTextDocument(file);
              const matches = diagnosticsManager.updateDiagnostics(doc);
              if (matches.length > 0) {
                filesWithLogs++;
                totalStatements += matches.length;
              }
            } catch {
              // Ignore unreadable files
            }
          }

          statusBarManager.update();

          if (totalStatements === 0) {
            vscode.window.showInformationMessage(
              `Console.log Janitor: Scanned ${files.length} file(s). No console.log statements found.`
            );
          } else {
            vscode.window.showInformationMessage(
              `Console.log Janitor: Found ${totalStatements} statement(s) across ${filesWithLogs} file(s) (scanned ${files.length} files).`
            );
          }
        }
      );
    })
  );

  // 3. Remove console.log Statements from Current File (Command Palette)
  context.subscriptions.push(
    vscode.commands.registerCommand("consoleLogJanitor.removeCurrentFile", async () => {
      await removeAllInFile(undefined, diagnosticsManager, statusBarManager, true);
    })
  );

  // 4. Remove all in File (invoked by Quick Fix or command)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "consoleLogJanitor.removeAllInFile",
      async (uri?: vscode.Uri) => {
        await removeAllInFile(uri, diagnosticsManager, statusBarManager, true);
      }
    )
  );

  // 5. Remove all in Workspace (invoked by Quick Fix or command)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "consoleLogJanitor.removeAllInWorkspace",
      async () => {
        await removeAllInWorkspace(diagnosticsManager, statusBarManager, true);
      }
    )
  );

  // 6. Clear Diagnostics
  context.subscriptions.push(
    vscode.commands.registerCommand("consoleLogJanitor.clearDiagnostics", () => {
      diagnosticsManager.clearAll();
      statusBarManager.update();
      vscode.window.showInformationMessage("Console.log Janitor: Diagnostics cleared.");
    })
  );

  // 7. Status Bar Action Menu (instant, zero disk scan)
  context.subscriptions.push(
    vscode.commands.registerCommand("consoleLogJanitor.showStatusBarMenu", async () => {
      const editor = vscode.window.activeTextEditor;
      let activeFileCount = 0;

      if (editor && isSupportedLanguage(editor.document.languageId)) {
        const matches = diagnosticsManager.getMatches(editor.document.uri);
        activeFileCount = matches.filter((m) => !m.isSuppressed).length;
      }

      interface StatusMenuItem extends vscode.QuickPickItem {
        commandId: string;
      }

      const items: StatusMenuItem[] = [];

      if (activeFileCount === 1) {
        items.push({
          label: "$(trash) Remove console.log in this file",
          description: "Clean active file",
          commandId: "consoleLogJanitor.removeCurrentFile",
        });
      } else if (activeFileCount > 1) {
        items.push({
          label: `$(trash) Remove all ${activeFileCount} console.log statements in this file`,
          description: "Clean active file",
          commandId: "consoleLogJanitor.removeCurrentFile",
        });
      }

      items.push({
        label: "$(globe) Remove console.log statements in workspace",
        description: "Review and clean across workspace files",
        commandId: "consoleLogJanitor.removeAllInWorkspace",
      });

      items.push({
        label: "$(refresh) Re-scan current file",
        description: "Re-scan the active document for console.log statements",
        commandId: "consoleLogJanitor.scanCurrentFile",
      });

      items.push({
        label: "$(clear-all) Clear diagnostics",
        description: "Clear all problem markers",
        commandId: "consoleLogJanitor.clearDiagnostics",
      });

      items.push({
        label: "$(gear) Open Settings",
        description: "Open Console.log Janitor configuration",
        commandId: "workbench.action.openSettings",
      });

      const selected = await vscode.window.showQuickPick(items, {
        title: "Console.log Janitor",
        placeHolder: "Select a Janitor action:",
      });

      if (selected) {
        if (selected.commandId === "workbench.action.openSettings") {
          await vscode.commands.executeCommand("workbench.action.openSettings", "consoleLogJanitor");
        } else {
          await vscode.commands.executeCommand(selected.commandId);
        }
      }
    })
  );
}
