import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { removeAllInFile, removeAllInWorkspace, validateEdits, validatePlans } from "../src/bulkCleaner";
import { isWorkspaceCleanableFile } from "../src/config";
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

    // Mock workspace.applyEdit faithfully replicating VS Code's overlap rejection
    vi.spyOn(vscode.workspace, "applyEdit").mockImplementation(
      async (edit: vscode.WorkspaceEdit) => {
        const entries = edit.entries();
        for (const [uri, textEdits] of entries) {
          const sorted = [...textEdits].sort((a, b) => {
            if (a.range.start.line !== b.range.start.line) {
              return a.range.start.line - b.range.start.line;
            }
            return a.range.start.character - b.range.start.character;
          });
          for (let i = 0; i < sorted.length - 1; i++) {
            const curEnd = sorted[i].range.end;
            const nextStart = sorted[i + 1].range.start;
            const isBefore =
              nextStart.line < curEnd.line ||
              (nextStart.line === curEnd.line && nextStart.character < curEnd.character);
            if (isBefore) {
              return false;
            }
          }
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

    it("successfully removes all 5 console.log statements from a single file without trailing newline (QA reproduction)", async () => {
      const code = `console.log("1");\nconsole.log("2");\nconsole.log("3");\nconsole.log("4");\nconsole.log("5");`;
      const doc = createMockDocument(code);
      const diagMgr = new DiagnosticsManager();
      userConfirmationResponse = "Remove";

      const result = await removeAllInFile(doc, diagMgr, undefined, true);

      expect(result.applied).toBe(true);
      expect(result.removed).toBe(5);
      expect(appliedEdits.has(doc.uri.toString())).toBe(true);
      const edits = appliedEdits.get(doc.uri.toString())!;
      expect(edits.length).toBeGreaterThan(0);
    });

    it("successfully removes all 5 console.log statements from a single file with trailing newline", async () => {
      const code = `console.log("1");\nconsole.log("2");\nconsole.log("3");\nconsole.log("4");\nconsole.log("5");\n`;
      const doc = createMockDocument(code);
      const diagMgr = new DiagnosticsManager();
      userConfirmationResponse = "Remove";

      const result = await removeAllInFile(doc, diagMgr, undefined, true);

      expect(result.applied).toBe(true);
      expect(result.removed).toBe(5);
      expect(appliedEdits.has(doc.uri.toString())).toBe(true);
    });

    it("successfully removes all 2 consecutive console.log statements from a single file", async () => {
      const code = `console.log("1");\nconsole.log("2");`;
      const doc = createMockDocument(code);
      const diagMgr = new DiagnosticsManager();
      userConfirmationResponse = "Remove";

      const result = await removeAllInFile(doc, diagMgr, undefined, true);

      expect(result.applied).toBe(true);
      expect(result.removed).toBe(2);
      expect(appliedEdits.has(doc.uri.toString())).toBe(true);
    });

    it("successfully removes multiple separated console.log statements from a single file", async () => {
      const code = `const a = 1;\nconsole.log(a);\nconst b = 2;\nconsole.log(b);\nconst c = 3;\nconsole.log(c);\nconst d = 4;\nconsole.log(d);\nconsole.log("last");`;
      const doc = createMockDocument(code);
      const diagMgr = new DiagnosticsManager();
      userConfirmationResponse = "Remove";

      const result = await removeAllInFile(doc, diagMgr, undefined, true);

      expect(result.applied).toBe(true);
      expect(result.removed).toBe(5);
      expect(appliedEdits.has(doc.uri.toString())).toBe(true);
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

    it("automatically excludes declaration, minified, bundled, and coverage files", () => {
      expect(isWorkspaceCleanableFile("src/types.d.ts")).toBe(false);
      expect(isWorkspaceCleanableFile("dist/app.js")).toBe(false);
      expect(isWorkspaceCleanableFile("coverage/lcov-report/index.js")).toBe(false);
      expect(isWorkspaceCleanableFile("node_modules/lib/index.js")).toBe(false);
      expect(isWorkspaceCleanableFile(".git/hooks/pre-commit.js")).toBe(false);
      expect(isWorkspaceCleanableFile("out/main.js")).toBe(false);
      expect(isWorkspaceCleanableFile("build/output.js")).toBe(false);
      expect(isWorkspaceCleanableFile("static/bundle.min.js")).toBe(false);
      expect(isWorkspaceCleanableFile("src/vendor.bundle.js")).toBe(false);

      // Cleanable files
      expect(isWorkspaceCleanableFile("src/index.ts")).toBe(true);
      expect(isWorkspaceCleanableFile("src/components/App.tsx")).toBe(true);
      expect(isWorkspaceCleanableFile("src/utils.js")).toBe(true);
      expect(isWorkspaceCleanableFile("src/views/Home.jsx")).toBe(true);
    });

    it("skips files with file-level disable directive during workspace cleanup", async () => {
      const file1Code = `// console-log-janitor-disable
console.log("disabled file");`;
      const file2Code = `console.log("active file");`;

      const doc1 = createMockDocument(file1Code, "file:///workspace/disabled.ts");
      const doc2 = createMockDocument(file2Code, "file:///workspace/active.ts");

      vi.spyOn(vscode.workspace, "findFiles").mockResolvedValue([doc1.uri, doc2.uri]);
      vi.spyOn(vscode.workspace, "openTextDocument").mockImplementation(
        async (uriOrPath: any) => {
          if (uriOrPath.toString().includes("disabled.ts")) return doc1;
          return doc2;
        }
      );

      const diagMgr = new DiagnosticsManager();
      userConfirmationResponse = "Remove All";

      const result = await removeAllInWorkspace(diagMgr, undefined, true);

      expect(result.applied).toBe(true);
      expect(result.totalStatements).toBe(1);
      expect(result.affectedFiles).toBe(1);
      expect(appliedEdits.has(doc1.uri.toString())).toBe(false);
      expect(appliedEdits.has(doc2.uri.toString())).toBe(true);
    });

    it("skips file and notifies user when removeAllInFile is called on disabled file", async () => {
      const fileCode = `/* console-log-janitor-disable */
console.log("disabled file");`;
      const doc = createMockDocument(fileCode, "file:///workspace/disabled.ts");

      const result = await removeAllInFile(doc, undefined, undefined, true);

      expect(result.applied).toBe(false);
      expect(result.removed).toBe(0);
      expect(infoMessages[0]).toContain("disabled via console-log-janitor-disable");
      expect(appliedEdits.size).toBe(0);
    });

    it("pre-validates edits and applies zero edits if validation fails", async () => {
      const code = `console.log("test");`;
      const doc = createMockDocument(code);

      // Malformed edit: out of bounds
      const invalidEdits = [{ startOffset: 100, endOffset: 200, newText: "" }];
      expect(validateEdits(doc, invalidEdits)).toBe(false);

      // Inverted offsets
      const invertedEdits = [{ startOffset: 10, endOffset: 5, newText: "" }];
      expect(validateEdits(doc, invertedEdits)).toBe(false);

      // Negative offset
      const negativeEdits = [{ startOffset: -1, endOffset: 5, newText: "" }];
      expect(validateEdits(doc, negativeEdits)).toBe(false);

      // Content mismatch
      const mismatchEdits = [{ startOffset: 0, endOffset: 7, newText: "" }]; // targets "console"
      const nonMatchingDoc = createMockDocument("const x = 1234567;");
      expect(validateEdits(nonMatchingDoc, mismatchEdits)).toBe(false);

      // Overlapping edits
      const overlappingEdits = [
        { startOffset: 0, endOffset: 12, newText: "" },
        { startOffset: 10, endOffset: 20, newText: "" },
      ];
      const multiDoc = createMockDocument(`console.log("1");console.log("2");`);
      expect(validateEdits(multiDoc, overlappingEdits)).toBe(false);

      // Valid adjacent non-overlapping edits
      const validAdjacentEdits = [
        { startOffset: 0, endOffset: 17, newText: "" },
        { startOffset: 17, endOffset: 34, newText: "" },
      ];
      expect(validateEdits(multiDoc, validAdjacentEdits)).toBe(true);
    });

    it("supports review confirmation via native QuickPick selection", async () => {
      const fileCode = `console.log("pick test");`;
      const doc = createMockDocument(fileCode, "file:///workspace/pick.ts");

      vi.spyOn(vscode.workspace, "findFiles").mockResolvedValue([doc.uri]);
      vi.spyOn(vscode.workspace, "openTextDocument").mockResolvedValue(doc);

      // Simulate user picking "Apply Cleanup"
      vi.spyOn(vscode.window, "showQuickPick").mockResolvedValue({
        label: "$(check) Remove All",
        action: "apply",
      } as any);

      const diagMgr = new DiagnosticsManager();
      const result = await removeAllInWorkspace(diagMgr, undefined, true);

      expect(result.applied).toBe(true);
      expect(result.totalStatements).toBe(1);
      expect(appliedEdits.has(doc.uri.toString())).toBe(true);
    });

    it("cancels and applies zero edits when user selects Cancel in QuickPick", async () => {
      appliedEdits.clear();
      const fileCode = `console.log("cancel test");`;
      const doc = createMockDocument(fileCode, "file:///workspace/cancel.ts");

      vi.spyOn(vscode.workspace, "findFiles").mockResolvedValue([doc.uri]);
      vi.spyOn(vscode.workspace, "openTextDocument").mockResolvedValue(doc);

      // Simulate user picking "Cancel"
      vi.spyOn(vscode.window, "showQuickPick").mockResolvedValue({
        label: "$(x) Cancel",
        action: "cancel",
      } as any);

      const diagMgr = new DiagnosticsManager();
      const result = await removeAllInWorkspace(diagMgr, undefined, true);

      expect(result.applied).toBe(false);
      expect(result.cancelled).toBe(true);
      expect(appliedEdits.size).toBe(0);
    });
  });
});
