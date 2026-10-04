/**
 * Bulk cleanup operations for removing console.log statements
 * across an entire file or the entire workspace with explicit confirmation.
 */

import * as vscode from "vscode";
import { isSupportedLanguage, isWorkspaceCleanableFile } from "./config";
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

interface ReviewDetail {
  relativePath: string;
  count: number;
  previews: string[];
}

interface ReviewItem extends vscode.QuickPickItem {
  action?: "apply" | "cancel";
}

function getDisplayPath(uri: vscode.Uri): string {
  try {
    if (vscode.workspace && typeof vscode.workspace.asRelativePath === "function") {
      return vscode.workspace.asRelativePath(uri);
    }
  } catch {
    // ignore
  }
  return uri.fsPath || uri.path;
}

/**
 * Validates that all planned edits are within document bounds, target console.log text,
 * and contain no overlapping ranges.
 */
export function validateEdits(document: vscode.TextDocument, edits: TextEditOperation[]): boolean {
  const text = document.getText();
  const len = text.length;

  for (const edit of edits) {
    if (edit.startOffset < 0 || edit.endOffset > len || edit.startOffset > edit.endOffset) {
      return false;
    }
    if (edit.startOffset !== edit.endOffset) {
      const target = text.slice(edit.startOffset, edit.endOffset);
      if (!target.includes("console") && !target.includes("log")) {
        return false;
      }
    }
  }

  // Ensure edits are strictly non-overlapping (adjacent/touching is allowed, strict overlap is rejected)
  const sorted = [...edits].sort(
    (a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset
  );
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i + 1].startOffset < sorted[i].endOffset) {
      return false;
    }
  }

  return true;
}

/**
 * Validates that all files in the batch plan pass bounds and content verification.
 */
export function validatePlans(plans: { document: vscode.TextDocument; edits: TextEditOperation[] }[]): boolean {
  for (const plan of plans) {
    if (!validateEdits(plan.document, plan.edits)) {
      return false;
    }
  }
  return true;
}

/**
 * Shows native VS Code review UI (QuickPick with affected files, counts, and previews)
 * falling back to modal warning dialog.
 */
async function showReviewDialog(
  title: string,
  summary: string,
  fileDetails: ReviewDetail[],
  totalStatements: number,
  affectedFiles: number,
  actionButtonLabel: string
): Promise<boolean> {
  const detailLines: string[] = [];
  for (const f of fileDetails) {
    detailLines.push(`• ${f.relativePath} (${f.count} statement${f.count === 1 ? "" : "s"})`);
    for (const preview of f.previews.slice(0, 3)) {
      detailLines.push(`   ${preview}`);
    }
    if (f.previews.length > 3) {
      detailLines.push(`   ... and ${f.previews.length - 3} more`);
    }
  }
  const modalDetail = detailLines.join("\n");

  if (vscode.window.showQuickPick) {
    const items: (ReviewItem | vscode.QuickPickItem)[] = [
      {
        label: `$(check) ${actionButtonLabel}`,
        description: `${totalStatements} statement${totalStatements === 1 ? "" : "s"}${
          affectedFiles > 1 ? ` across ${affectedFiles} files` : ""
        }`,
        action: "apply",
      },
      {
        label: "$(x) Cancel",
        description: "Do not modify any files",
        action: "cancel",
      },
    ];

    if (vscode.QuickPickItemKind) {
      items.push({
        label: "Affected Files & Statements",
        kind: vscode.QuickPickItemKind.Separator,
      });
    }

    for (const f of fileDetails) {
      items.push({
        label: `$(file-code) ${f.relativePath}`,
        description: `${f.count} statement${f.count === 1 ? "" : "s"}`,
        detail: f.previews.slice(0, 3).join("  |  "),
      });
    }

    const pick = await vscode.window.showQuickPick<ReviewItem | vscode.QuickPickItem>(items, {
      title,
      placeHolder: `${summary} Select an action:`,
    });

    if (pick && "action" in pick) {
      return pick.action === "apply";
    }
  }

  // Fallback to modal dialog
  const answer = await vscode.window.showWarningMessage(
    summary,
    { modal: true, detail: modalDetail },
    actionButtonLabel
  );

  return answer === actionButtonLabel;
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

  if (detector.isFileSuppressed()) {
    vscode.window.showInformationMessage(
      "Console.log Janitor: This file is disabled via console-log-janitor-disable."
    );
    return { removed: 0, applied: false };
  }

  if (unsuppressed.length === 0) {
    vscode.window.showInformationMessage(
      "Console.log Janitor: No console.log statements found to remove in this file."
    );
    return { removed: 0, applied: false };
  }

  const lineIndex = new LineIndex(source);
  const edits = computeBatchRemovalEdits(source, unsuppressed, lineIndex);

  // Pre-validate all edits before asking for confirmation or applying
  if (!validateEdits(document, edits)) {
    vscode.window.showErrorMessage(
      "Console.log Janitor: Cleanup validation failed. File was not modified."
    );
    return { removed: 0, applied: false };
  }

  // Explicit user confirmation with review UI
  if (requireConfirmation) {
    const count = unsuppressed.length;
    const prompt =
      count === 1
        ? "Remove 1 console.log statement from this file?"
        : `Remove all ${count} console.log statements from this file?`;

    const previews = unsuppressed.map(
      (m) => `Line ${m.statementRange.start.line + 1}: console.log(${m.argsSnippet})`
    );

    const confirmed = await showReviewDialog(
      "Console.log Janitor — Review File Cleanup",
      prompt,
      [{ relativePath: getDisplayPath(document.uri), count, previews }],
      count,
      1,
      "Remove"
    );

    if (!confirmed) {
      return { removed: 0, applied: false, cancelled: true };
    }
  }

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
  const rawFiles = await vscode.workspace.findFiles(
    "**/*.{js,ts,jsx,tsx}",
    "**/{node_modules,.git,dist,out,build,coverage}/**"
  );

  const files = rawFiles.filter((f) => isWorkspaceCleanableFile(f));

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
      if (detector.isFileSuppressed()) continue;

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

  // Pre-validate all plans before confirmation and application
  if (!validatePlans(plans)) {
    vscode.window.showErrorMessage(
      "Console.log Janitor: Cleanup validation failed. Workspace was not modified."
    );
    return { totalStatements: 0, affectedFiles: 0, applied: false };
  }

  const affectedFiles = plans.length;

  // Explicit user confirmation with review UI
  if (requireConfirmation) {
    const stmtText =
      totalStatements === 1
        ? "1 console.log statement"
        : `${totalStatements} console.log statements`;
    const fileText =
      affectedFiles === 1 ? "1 file" : `${affectedFiles} files`;

    const prompt = `Remove ${stmtText} across ${fileText} in the workspace?`;

    const fileDetails: ReviewDetail[] = plans.map((p) => ({
      relativePath: getDisplayPath(p.document.uri),
      count: p.matches.length,
      previews: p.matches.map(
        (m) => `Line ${m.statementRange.start.line + 1}: console.log(${m.argsSnippet})`
      ),
    }));

    const confirmed = await showReviewDialog(
      "Console.log Janitor — Review Workspace Cleanup",
      prompt,
      fileDetails,
      totalStatements,
      affectedFiles,
      "Remove All"
    );

    if (!confirmed) {
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
