import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { removeAllInFile, removeAllInWorkspace } from "../src/bulkCleaner";
import { DiagnosticsManager } from "../src/diagnostics";

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

describe("Bulk Cleaner", () => {
  let appliedEdits: Map<string, vscode.TextEdit[]>;
  let infoMessages: string[];
  let warningMessages: { message: string; options?: any; items: any[] }[];
  let userConfirmationResponse: string | undefined;

  beforeEach(() => {
    appliedEdits = new Map();
    infoMessages = [];
    warningMessages = [];
    userConfirmationResponse = undefined;

    // Spy/mock window messages
    vi.spyOn(vscode.window, "showWarningMessage").mockImplementation(
      async (message: string, options?: any, ...items: any[]) => {
        warningMessages.push({ message, options, items });
        return userConfirmationResponse as any;
      }
    );

    vi.spyOn(vscode.window, "showInformationMessage").mockImplementation(
      async (message: string) => {
        infoMessages.push(message);
        return undefined;
      }
    );

    // Mock workspace.applyEdit
    vi.spyOn(vscode.workspace, "applyEdit").mockImplementation(
      async (edit: vscode.WorkspaceEdit) => {
        const entries = edit.entries();
        for (const [uri, textEdits] of entries) {
          appliedEdits.set(uri.toString(), textEdits);
        }
        return true;
      }
    );
  });

  describe("removeAllInFile", () => {
    it("removes all unsuppressed statements when user confirms", async () => {
      const code = `
function test() {
  console.log("first");
  const a = 1;
  console.log("second", a);
  return a;
}
`;
      const doc = createMockDocument(code);
      const diagMgr = new DiagnosticsManager();
      userConfirmationResponse = "Remove";

      const result = await removeAllInFile(doc, diagMgr, undefined, true);

      expect(result.applied).toBe(true);
      expect(result.removed).toBe(2);
      expect(warningMessages).toHaveLength(1);
      expect(warningMessages[0].message).toContain("Remove all 2 console.log statements");
      expect(appliedEdits.has(doc.uri.toString())).toBe(true);
      expect(appliedEdits.get(doc.uri.toString())).toHaveLength(2);
    });

    it("cancels removal when user dismisses or declines confirmation", async () => {
      const code = `console.log("do not remove if cancelled");`;
      const doc = createMockDocument(code);
      const diagMgr = new DiagnosticsManager();
      userConfirmationResponse = undefined; // User cancelled / dismissed

      const result = await removeAllInFile(doc, diagMgr, undefined, true);

      expect(result.applied).toBe(false);
      expect(result.cancelled).toBe(true);
      expect(result.removed).toBe(0);
      expect(appliedEdits.size).toBe(0);
    });

    it("preserves statements covered by suppression directives", async () => {
      const code = `
// console-log-janitor-ignore
console.log("keep me");

console.log("remove me");
`;
      const doc = createMockDocument(code);
      const diagMgr = new DiagnosticsManager();
      userConfirmationResponse = "Remove";

      const result = await removeAllInFile(doc, diagMgr, undefined, true);

      expect(result.applied).toBe(true);
      expect(result.removed).toBe(1); // Only 1 unsuppressed statement removed
      expect(warningMessages[0].message).toContain("Remove 1 console.log statement");
      const edits = appliedEdits.get(doc.uri.toString());
      expect(edits).toHaveLength(1);
    });

    it("shows informational message and does not prompt when zero statements exist", async () => {
      const code = `const x = 1;\nconst y = 2;`;
      const doc = createMockDocument(code);
      const diagMgr = new DiagnosticsManager();

      const result = await removeAllInFile(doc, diagMgr, undefined, true);

      expect(result.applied).toBe(false);
      expect(result.removed).toBe(0);
      expect(warningMessages).toHaveLength(0); // No modal prompt shown
      expect(infoMessages).toHaveLength(1);
      expect(infoMessages[0]).toContain("No console.log statements found to remove");
    });
  });

  describe("removeAllInWorkspace", () => {
    it("scans workspace and removes all statements across multiple files upon confirmation", async () => {
      const file1Code = `console.log("file1 A");\nconsole.log("file1 B");`;
      const file2Code = `const x = 1;\nconsole.log("file2 A");`;
      const doc1 = createMockDocument(file1Code, "file:///workspace/file1.ts");
      const doc2 = createMockDocument(file2Code, "file:///workspace/file2.js");

      vi.spyOn(vscode.workspace, "findFiles").mockResolvedValue([
        doc1.uri,
        doc2.uri,
      ]);

      vi.spyOn(vscode.workspace, "openTextDocument").mockImplementation(
        async (uriOrPath: any) => {
          const uriStr = uriOrPath.toString();
          if (uriStr.includes("file1.ts")) return doc1;
          if (uriStr.includes("file2.js")) return doc2;
          throw new Error("File not found");
        }
      );

      const diagMgr = new DiagnosticsManager();
      userConfirmationResponse = "Remove All";

      const result = await removeAllInWorkspace(diagMgr, undefined, true);

      expect(result.applied).toBe(true);
      expect(result.totalStatements).toBe(3);
      expect(result.affectedFiles).toBe(2);

      // Verify prompt clearly states statements and files count
      expect(warningMessages).toHaveLength(1);
      expect(warningMessages[0].message).toContain("3 console.log statements");
      expect(warningMessages[0].message).toContain("2 files");

      // Verify edits applied across both files
      expect(appliedEdits.has(doc1.uri.toString())).toBe(true);
      expect(appliedEdits.has(doc2.uri.toString())).toBe(true);
      expect(appliedEdits.get(doc1.uri.toString())).toHaveLength(2);
      expect(appliedEdits.get(doc2.uri.toString())).toHaveLength(1);
    });

    it("cancels workspace removal when user declines confirmation", async () => {
      const fileCode = `console.log("file");`;
      const doc = createMockDocument(fileCode, "file:///workspace/file.ts");

      vi.spyOn(vscode.workspace, "findFiles").mockResolvedValue([doc.uri]);
      vi.spyOn(vscode.workspace, "openTextDocument").mockResolvedValue(doc);

      const diagMgr = new DiagnosticsManager();
      userConfirmationResponse = undefined; // Cancelled

      const result = await removeAllInWorkspace(diagMgr, undefined, true);

      expect(result.applied).toBe(false);
      expect(result.cancelled).toBe(true);
      expect(appliedEdits.size).toBe(0);
    });

    it("shows informational message when zero statements found in workspace", async () => {
      const fileCode = `const noLogs = true;`;
      const doc = createMockDocument(fileCode, "file:///workspace/clean.ts");

      vi.spyOn(vscode.workspace, "findFiles").mockResolvedValue([doc.uri]);
      vi.spyOn(vscode.workspace, "openTextDocument").mockResolvedValue(doc);

      const diagMgr = new DiagnosticsManager();

      const result = await removeAllInWorkspace(diagMgr, undefined, true);

      expect(result.applied).toBe(false);
      expect(result.totalStatements).toBe(0);
      expect(warningMessages).toHaveLength(0);
      expect(infoMessages).toHaveLength(1);
      expect(infoMessages[0]).toContain("No console.log statements found across the workspace");
    });

    it("preserves suppressed statements across workspace files", async () => {
      const file1Code = `
// console-log-janitor-ignore
console.log("suppressed in file 1");
`;
      const file2Code = `
console.log("real in file 2");
`;
      const doc1 = createMockDocument(file1Code, "file:///workspace/f1.ts");
      const doc2 = createMockDocument(file2Code, "file:///workspace/f2.ts");

      vi.spyOn(vscode.workspace, "findFiles").mockResolvedValue([doc1.uri, doc2.uri]);
      vi.spyOn(vscode.workspace, "openTextDocument").mockImplementation(
        async (uriOrPath: any) => {
          if (uriOrPath.toString().includes("f1.ts")) return doc1;
          return doc2;
        }
      );

      const diagMgr = new DiagnosticsManager();
      userConfirmationResponse = "Remove All";

      const result = await removeAllInWorkspace(diagMgr, undefined, true);

      expect(result.applied).toBe(true);
      expect(result.totalStatements).toBe(1);
      expect(result.affectedFiles).toBe(1);
      expect(appliedEdits.has(doc1.uri.toString())).toBe(false); // No edits for f1
      expect(appliedEdits.has(doc2.uri.toString())).toBe(true);
    });
  });
});
