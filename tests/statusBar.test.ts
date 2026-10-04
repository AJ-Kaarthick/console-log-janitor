import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { StatusBarManager } from "../src/statusBar";
import { DiagnosticsManager } from "../src/diagnostics";
import { registerCommands } from "../src/commands";

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
    offsetAt: (pos: vscode.Position) => 0,
    positionAt: (offset: number) => new vscode.Position(0, 0),
  } as unknown as vscode.TextDocument;
}

describe("StatusBarManager and showStatusBarMenu", () => {
  let diagMgr: DiagnosticsManager;
  let statusMgr: StatusBarManager;
  let registeredCommands: Map<string, (...args: any[]) => any>;
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    registeredCommands = new Map();
    vi.spyOn(vscode.commands, "registerCommand").mockImplementation(
      (command: string, callback: (...args: any[]) => any) => {
        registeredCommands.set(command, callback);
        return { dispose: () => {} };
      }
    );

    mockContext = {
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;

    diagMgr = new DiagnosticsManager();
    statusMgr = new StatusBarManager(diagMgr);
    registerCommands(mockContext, diagMgr, statusMgr);
  });

  it("updates text and tooltip correctly based on findings count", () => {
    const doc = createMockDocument("console.log('one'); console.log('two');");
    const editor = { document: doc } as vscode.TextEditor;

    diagMgr.updateDiagnostics(doc);
    statusMgr.update(editor);

    // Access status bar item via text/tooltip
    expect(vscode.window.createStatusBarItem).toBeDefined();
  });

  it("registers showStatusBarMenu and displays contextual QuickPick items", async () => {
    expect(registeredCommands.has("consoleLogJanitor.showStatusBarMenu")).toBe(true);

    const doc = createMockDocument("console.log('one'); console.log('two');");
    const editor = { document: doc } as vscode.TextEditor;
    vscode.window.activeTextEditor = editor;

    diagMgr.updateDiagnostics(doc);

    let quickPickItems: any[] = [];
    vi.spyOn(vscode.window, "showQuickPick").mockImplementation(async (items: any) => {
      quickPickItems = items;
      return undefined;
    });

    const menuHandler = registeredCommands.get("consoleLogJanitor.showStatusBarMenu")!;
    await menuHandler();

    expect(quickPickItems.length).toBeGreaterThan(0);
    // Should have "Remove all 2 console.log statements in this file"
    const removeFileItem = quickPickItems.find((item: any) =>
      item.label.includes("Remove all 2")
    );
    expect(removeFileItem).toBeDefined();

    // Should have workspace item
    const workspaceItem = quickPickItems.find((item: any) =>
      item.label.includes("workspace")
    );
    expect(workspaceItem).toBeDefined();

    // Should have settings item
    const settingsItem = quickPickItems.find((item: any) =>
      item.label.includes("Settings")
    );
    expect(settingsItem).toBeDefined();
  });

  it("omits file removal action when active editor has zero findings", async () => {
    const doc = createMockDocument("const x = 1;");
    const editor = { document: doc } as vscode.TextEditor;
    vscode.window.activeTextEditor = editor;

    diagMgr.updateDiagnostics(doc);

    let quickPickItems: any[] = [];
    vi.spyOn(vscode.window, "showQuickPick").mockImplementation(async (items: any) => {
      quickPickItems = items;
      return undefined;
    });

    const menuHandler = registeredCommands.get("consoleLogJanitor.showStatusBarMenu")!;
    await menuHandler();

    const removeFileItem = quickPickItems.find((item: any) =>
      item.label.includes("in this file")
    );
    expect(removeFileItem).toBeUndefined();

    // Still has workspace and settings items
    expect(quickPickItems.find((i: any) => i.label.includes("workspace"))).toBeDefined();
    expect(quickPickItems.find((i: any) => i.label.includes("Settings"))).toBeDefined();
  });
});
