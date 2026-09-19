import { describe, it, expect } from "vitest";
import * as vscode from "vscode";
import { ConsoleLogCodeActionProvider } from "../src/codeActions";
import {
  DIAGNOSTIC_CODE_REMOVE,
  DIAGNOSTIC_MESSAGE,
  DiagnosticsManager,
} from "../src/diagnostics";

// Helper to create mock TextDocument
function createMockDocument(
  text: string,
  uriStr: string = "file:///test/example.ts",
  languageId: string = "typescript"
): vscode.TextDocument {
  const uri = {
    toString: () => uriStr,
    fsPath: uriStr.replace("file://", ""),
  } as unknown as vscode.Uri;

  const lines = text.split("\n");

  return {
    uri,
    languageId,
    getText: () => text,
    offsetAt: (pos: vscode.Position) => {
      let offset = 0;
      for (let i = 0; i < pos.line; i++) {
        offset += lines[i].length + 1;
      }
      return offset + pos.character;
    },
    positionAt: (offset: number) => {
      let remaining = offset;
      for (let i = 0; i < lines.length; i++) {
        const lineLen = lines[i].length + 1;
        if (remaining < lineLen) {
          return new vscode.Position(i, remaining);
        }
        remaining -= lineLen;
      }
      return new vscode.Position(lines.length - 1, (lines[lines.length - 1] || "").length);
    },
  } as unknown as vscode.TextDocument;
}

describe("Diagnostics & Code Actions Provider", () => {
  it("generates diagnostics with appropriate metadata", () => {
    const code = `function run() {
  console.log("diagnose me");
}`;
    const doc = createMockDocument(code);
    const diagMgr = new DiagnosticsManager();
    const matches = diagMgr.updateDiagnostics(doc);

    expect(matches).toHaveLength(1);
    expect(diagMgr.getMatches(doc.uri)).toHaveLength(1);

    diagMgr.clearDocument(doc.uri);
    expect(diagMgr.getMatches(doc.uri)).toHaveLength(0);
  });

  it("provides single Remove, Ignore, File-level, and Workspace-level Code Actions for detected statement", () => {
    const code = `function run() {
  console.log("quick fix me");
}`;
    const doc = createMockDocument(code);
    const diagMgr = new DiagnosticsManager();
    diagMgr.updateDiagnostics(doc);

    const provider = new ConsoleLogCodeActionProvider(diagMgr);
    const cursorRange = new vscode.Range(1, 4, 1, 15);
    const context: vscode.CodeActionContext = {
      diagnostics: [
        new vscode.Diagnostic(
          cursorRange,
          DIAGNOSTIC_MESSAGE,
          vscode.DiagnosticSeverity.Information
        ),
      ],
      only: undefined,
      triggerKind: 1 as unknown as vscode.CodeActionTriggerKind,
    };

    const actions = provider.provideCodeActions(doc, cursorRange, context);

    expect(actions).toHaveLength(4);

    // 1. Remove console.log
    const removeAction = actions.find((a) => a.title === "Remove console.log");
    expect(removeAction).toBeDefined();
    expect(removeAction?.isPreferred).toBe(true);
    expect(removeAction?.edit).toBeDefined();

    // 2. Ignore this console.log
    const ignoreAction = actions.find((a) => a.title === "Ignore this console.log");
    expect(ignoreAction).toBeDefined();
    expect(ignoreAction?.edit).toBeDefined();

    // 3. Remove all console.log statements in this file
    const fileAction = actions.find(
      (a) => a.title === "Remove all console.log statements in this file"
    );
    expect(fileAction).toBeDefined();
    expect(fileAction?.command?.command).toBe("consoleLogJanitor.removeAllInFile");
    expect(fileAction?.command?.arguments).toEqual([doc.uri]);

    // 4. Remove all console.log statements in the workspace
    const workspaceAction = actions.find(
      (a) => a.title === "Remove all console.log statements in the workspace"
    );
    expect(workspaceAction).toBeDefined();
    expect(workspaceAction?.command?.command).toBe("consoleLogJanitor.removeAllInWorkspace");
  });

  it("does not provide actions when cursor is outside detected statements", () => {
    const code = `function run() {
  console.log("target");
  const x = 1;
}`;
    const doc = createMockDocument(code);
    const diagMgr = new DiagnosticsManager();
    diagMgr.updateDiagnostics(doc);

    const provider = new ConsoleLogCodeActionProvider(diagMgr);
    const outsideRange = new vscode.Range(2, 2, 2, 8); // On "const x = 1;"
    const context: vscode.CodeActionContext = {
      diagnostics: [],
      only: undefined,
      triggerKind: 1 as unknown as vscode.CodeActionTriggerKind,
    };

    const actions = provider.provideCodeActions(doc, outsideRange, context);
    expect(actions).toHaveLength(0);
  });

  it("does not provide actions for suppressed statements", () => {
    const code = `
// console-log-janitor-ignore
console.log("suppressed");
`;
    const doc = createMockDocument(code);
    const diagMgr = new DiagnosticsManager();
    diagMgr.updateDiagnostics(doc);

    const provider = new ConsoleLogCodeActionProvider(diagMgr);
    const cursorRange = new vscode.Range(2, 2, 2, 10);
    const context: vscode.CodeActionContext = {
      diagnostics: [],
      only: undefined,
      triggerKind: 1 as unknown as vscode.CodeActionTriggerKind,
    };

    const actions = provider.provideCodeActions(doc, cursorRange, context);
    expect(actions).toHaveLength(0);
  });
});
