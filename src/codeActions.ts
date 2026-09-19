/**
 * Native VS Code Code Actions (lightbulb quick-fixes) for Console.log Janitor.
 */

import * as vscode from "vscode";
import { DIAGNOSTIC_CODE_REMOVE, DiagnosticsManager } from "./diagnostics";
import { LineIndex } from "./scanner/lineIndex";
import { computeIgnoreEdit, computeRemovalEdit } from "./remover";
import { TextEditOperation } from "./scanner/types";

export class ConsoleLogCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  private readonly diagnosticsManager: DiagnosticsManager;

  constructor(diagnosticsManager: DiagnosticsManager) {
    this.diagnosticsManager = diagnosticsManager;
  }

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const matches = this.diagnosticsManager.getMatches(document.uri);
    if (matches.length === 0) {
      return actions;
    }

    const source = document.getText();
    const lineIndex = new LineIndex(source);
    const startOffset = document.offsetAt(range.start);
    const endOffset = document.offsetAt(range.end);

    // Find matches that intersect the range or cursor position
    const intersectingMatches = matches.filter(
      (m) =>
        !m.isSuppressed &&
        Math.max(startOffset, m.statementStartOffset) <=
          Math.min(endOffset, m.statementEndOffset)
    );

    if (intersectingMatches.length === 0) {
      return actions;
    }

    let firstRelatedDiag: vscode.Diagnostic | undefined;

    // 1 & 2: Single-statement Remove and Ignore actions
    for (const match of intersectingMatches) {
      const relatedDiag = context.diagnostics.find(
        (d) =>
          d.code === DIAGNOSTIC_CODE_REMOVE &&
          d.range.start.line === match.callRange.start.line
      );
      if (relatedDiag && !firstRelatedDiag) {
        firstRelatedDiag = relatedDiag;
      }

      // 1. Primary Quick-Fix: Remove console.log
      const removeAction = new vscode.CodeAction(
        "Remove console.log",
        vscode.CodeActionKind.QuickFix
      );
      removeAction.isPreferred = true;
      if (relatedDiag) {
        removeAction.diagnostics = [relatedDiag];
      }

      const removeOp = computeRemovalEdit(source, match, lineIndex);
      const removeEdit = new vscode.WorkspaceEdit();
      removeEdit.set(document.uri, [this.toVscodeEdit(document, removeOp)]);
      removeAction.edit = removeEdit;
      actions.push(removeAction);

      // 2. Quick-Fix: Ignore this console.log
      const ignoreAction = new vscode.CodeAction(
        "Ignore this console.log",
        vscode.CodeActionKind.QuickFix
      );
      if (relatedDiag) {
        ignoreAction.diagnostics = [relatedDiag];
      }

      const ignoreOp = computeIgnoreEdit(source, match, lineIndex);
      const ignoreEdit = new vscode.WorkspaceEdit();
      ignoreEdit.set(document.uri, [this.toVscodeEdit(document, ignoreOp)]);
      ignoreAction.edit = ignoreEdit;
      actions.push(ignoreAction);
    }

    // 3. Bulk Action: Remove all console.log statements in this file
    const removeAllFileAction = new vscode.CodeAction(
      "Remove all console.log statements in this file",
      vscode.CodeActionKind.QuickFix
    );
    if (firstRelatedDiag) {
      removeAllFileAction.diagnostics = [firstRelatedDiag];
    }
    removeAllFileAction.command = {
      command: "consoleLogJanitor.removeAllInFile",
      title: "Remove all console.log statements in this file",
      arguments: [document.uri],
    };
    actions.push(removeAllFileAction);

    // 4. Bulk Action: Remove all console.log statements in the workspace
    const removeAllWorkspaceAction = new vscode.CodeAction(
      "Remove all console.log statements in the workspace",
      vscode.CodeActionKind.QuickFix
    );
    if (firstRelatedDiag) {
      removeAllWorkspaceAction.diagnostics = [firstRelatedDiag];
    }
    removeAllWorkspaceAction.command = {
      command: "consoleLogJanitor.removeAllInWorkspace",
      title: "Remove all console.log statements in the workspace",
    };
    actions.push(removeAllWorkspaceAction);

    return actions;
  }

  private toVscodeEdit(
    document: vscode.TextDocument,
    op: TextEditOperation
  ): vscode.TextEdit {
    const startPos = document.positionAt(op.startOffset);
    const endPos = document.positionAt(op.endOffset);
    return new vscode.TextEdit(new vscode.Range(startPos, endPos), op.newText);
  }
}
