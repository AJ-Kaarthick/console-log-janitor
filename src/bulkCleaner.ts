/**
 * Bulk cleanup operations for removing console.log statements
 * across an entire file or the entire workspace with explicit confirmation.
 */

import * as vscode from "vscode";
import { isSupportedLanguage } from "./config";
import { DiagnosticsManager } from "./diagnostics";
import { computeBatchRemovalEdits } from "./remover";
import { LineIndex } from "./scanner/lineIndex";
import { Detector } from "./scanner/detector";
import { StatusBarManager } from "./statusBar";
import { ConsoleLogMatch, TextEditOperation } from "./scanner/types";

export interface BulkFileResult {
  removed: number;
  applied: boolean;
  cancelled?: boolean;
}

export interface BulkWorkspaceResult {
  totalStatements: number;
  affectedFiles: number;
  applied: boolean;
  cancelled?: boolean;
}

/**
 * Removes all unsuppressed console.log statements from a single file,
 * prompting the user for explicit confirmation.
 */
export async function removeAllInFile(
  documentOrUri?: vscode.TextDocument | vscode.Uri,
  diagnosticsManager?: DiagnosticsManager,
  statusBarManager?: StatusBarManager,
  requireConfirmation: boolean = true
): Promise<BulkFileResult> {
  let document: vscode.TextDocument | undefined;

  if (documentOrUri && "getText" in documentOrUri) {
    document = documentOrUri;
  } else if (documentOrUri) {
    try {
      document = await vscode.workspace.openTextDocument(documentOrUri);
    } catch {
      document = undefined;
    }
  } else {
    document = vscode.window.activeTextEditor?.document;
  }

  if (!document) {
    vscode.window.showInformationMessage("Console.log Janitor: No active file to clean.");
    return { removed: 0, applied: false };
  }

  if (!isSupportedLanguage(document.languageId)) {
    vscode.window.showInformationMessage(
      `Console.log Janitor: File type '${document.languageId}' is not supported.`
    );
    return { removed: 0, applied: false };
  }

  // Scan current content to get fresh unsuppressed matches
  const source = document.getText();
  const detector = new Detector(source);
  const unsuppressed = detector.detect().filter((m) => !m.isSuppressed);

  if (unsuppressed.length === 0) {
    vscode.window.showInformationMessage(
      "Console.log Janitor: No console.log statements found to remove in this file."
    );
    return { removed: 0, applied: false };
  }

  // Explicit user confirmation
  if (requireConfirmation) {
    const count = unsuppressed.length;
    const prompt =
      count === 1
        ? "Remove 1 console.log statement from this file?"
        : `Remove all ${count} console.log statements from this file?`;

    const answer = await vscode.window.showWarningMessage(
      prompt,
      { modal: true },
      "Remove"
    );

    if (answer !== "Remove") {
      return { removed: 0, applied: false, cancelled: true };
    }
  }

  const lineIndex = new LineIndex(source);
  const edits = computeBatchRemovalEdits(source, unsuppressed, lineIndex);

  const workspaceEdit = new vscode.WorkspaceEdit();
  const vscodeEdits = edits.map((op) => {
    const start = document!.positionAt(op.startOffset);
    const end = document!.positionAt(op.endOffset);
    return new vscode.TextEdit(new vscode.Range(start, end), op.newText);
  });

  workspaceEdit.set(document.uri, vscodeEdits);
  const applied = await vscode.workspace.applyEdit(workspaceEdit);

  if (applied) {
    if (diagnosticsManager) {
      diagnosticsManager.updateDiagnostics(document);
    }
    if (statusBarManager) {
      statusBarManager.update(vscode.window.activeTextEditor);
    }
    vscode.window.showInformationMessage(
      `Console.log Janitor: Successfully removed ${unsuppressed.length} console.log statement${
        unsuppressed.length === 1 ? "" : "s"
      }.`
    );
    return { removed: unsuppressed.length, applied: true };
  } else {
    vscode.window.showErrorMessage("Console.log Janitor: Failed to apply edits.");
    return { removed: 0, applied: false };
  }
}

/**
 * Removes all unsuppressed console.log statements across all supported workspace files,
 * prompting the user for explicit confirmation with statement and file counts.
 */
export async function removeAllInWorkspace(
  diagnosticsManager?: DiagnosticsManager,
  statusBarManager?: StatusBarManager,
  requireConfirmation: boolean = true
): Promise<BulkWorkspaceResult> {
  const files = await vscode.workspace.findFiles(
    "**/*.{js,ts,jsx,tsx}",
    "**/{node_modules,.git,dist,out,build}/**"
  );

  if (files.length === 0) {
    vscode.window.showInformationMessage(
      "Console.log Janitor: No JavaScript/TypeScript files found in workspace."
    );
    return { totalStatements: 0, affectedFiles: 0, applied: false };
  }

  interface FilePlan {
    document: vscode.TextDocument;
    matches: ConsoleLogMatch[];
    edits: TextEditOperation[];
  }

  const plans: FilePlan[] = [];
  let totalStatements = 0;

  for (const file of files) {
    try {
      const doc = await vscode.workspace.openTextDocument(file);
      if (!isSupportedLanguage(doc.languageId)) continue;

      const source = doc.getText();
      const detector = new Detector(source);
      const unsuppressed = detector.detect().filter((m) => !m.isSuppressed);

      if (unsuppressed.length > 0) {
        const lineIndex = new LineIndex(source);
        const edits = computeBatchRemovalEdits(source, unsuppressed, lineIndex);
        plans.push({ document: doc, matches: unsuppressed, edits });
        totalStatements += unsuppressed.length;
      }
    } catch {
      // Ignore unreadable files
    }
  }

  if (totalStatements === 0) {
    vscode.window.showInformationMessage(
      "Console.log Janitor: No console.log statements found across the workspace."
    );
    return { totalStatements: 0, affectedFiles: 0, applied: false };
  }

  const affectedFiles = plans.length;

  // Explicit user confirmation with counts
  if (requireConfirmation) {
    const stmtText =
      totalStatements === 1
        ? "1 console.log statement"
        : `${totalStatements} console.log statements`;
    const fileText =
      affectedFiles === 1 ? "1 file" : `${affectedFiles} files`;

    const prompt = `Remove ${stmtText} across ${fileText} in the workspace?`;

    const answer = await vscode.window.showWarningMessage(
      prompt,
      { modal: true },
      "Remove All"
    );

    if (answer !== "Remove All") {
      return { totalStatements: 0, affectedFiles: 0, applied: false, cancelled: true };
    }
  }

  // Apply edits atomically across all affected files
  const workspaceEdit = new vscode.WorkspaceEdit();
  for (const plan of plans) {
    const textEdits = plan.edits.map((op) => {
      const start = plan.document.positionAt(op.startOffset);
      const end = plan.document.positionAt(op.endOffset);
      return new vscode.TextEdit(new vscode.Range(start, end), op.newText);
    });
    workspaceEdit.set(plan.document.uri, textEdits);
  }

  const applied = await vscode.workspace.applyEdit(workspaceEdit);

  if (applied) {
    if (diagnosticsManager) {
      for (const plan of plans) {
        diagnosticsManager.updateDiagnostics(plan.document);
      }
    }
    if (statusBarManager) {
      statusBarManager.update();
    }

    const stmtText =
      totalStatements === 1
        ? "1 console.log statement"
        : `${totalStatements} console.log statements`;
    const fileText =
      affectedFiles === 1 ? "1 file" : `${affectedFiles} files`;

    vscode.window.showInformationMessage(
      `Console.log Janitor: Successfully removed ${stmtText} across ${fileText}.`
    );
    return { totalStatements, affectedFiles, applied: true };
  } else {
    vscode.window.showErrorMessage("Console.log Janitor: Failed to apply workspace edits.");
    return { totalStatements: 0, affectedFiles: 0, applied: false };
  }
}
