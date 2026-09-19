/**
 * Mock implementation of vscode module for unit tests.
 */

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export enum CodeActionKind {
  QuickFix = "quickfix",
  Refactor = "refactor",
  Source = "source",
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export interface Command {
  title: string;
  command: string;
  tooltip?: string;
  arguments?: any[];
}

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
  readonly start: Position;
  readonly end: Position;

  constructor(startLine: number, startChar: number, endLine: number, endChar: number);
  constructor(start: Position, end: Position);
  constructor(
    a: number | Position,
    b: number | Position,
    c?: number,
    d?: number
  ) {
    if (typeof a === "number") {
      this.start = new Position(a, b as number);
      this.end = new Position(c as number, d as number);
    } else {
      this.start = a;
      this.end = b as Position;
    }
  }
}

export class Diagnostic {
  source?: string;
  code?: string | number;

  constructor(
    public range: Range,
    public message: string,
    public severity: DiagnosticSeverity = DiagnosticSeverity.Error
  ) {}
}

export class TextEdit {
  constructor(public range: Range, public newText: string) {}
}

export class WorkspaceEdit {
  private edits = new Map<string, { uri: any; textEdits: TextEdit[] }>();

  set(uri: any, edits: TextEdit[]): void {
    this.edits.set(uri.toString(), { uri, textEdits: edits });
  }

  get(uri: any): TextEdit[] | undefined {
    return this.edits.get(uri.toString())?.textEdits;
  }

  entries(): [any, TextEdit[]][] {
    return Array.from(this.edits.values()).map((v) => [v.uri, v.textEdits]);
  }
}

export class CodeAction {
  isPreferred?: boolean;
  diagnostics?: Diagnostic[];
  edit?: WorkspaceEdit;
  command?: Command;

  constructor(public title: string, public kind?: CodeActionKind) {}
}

export class DiagnosticCollection {
  private store = new Map<string, Diagnostic[]>();

  constructor(public readonly name: string) {}

  set(uri: { toString(): string }, diagnostics: Diagnostic[]): void {
    this.store.set(uri.toString(), diagnostics);
  }

  get(uri: { toString(): string }): Diagnostic[] | undefined {
    return this.store.get(uri.toString());
  }

  delete(uri: { toString(): string }): void {
    this.store.delete(uri.toString());
  }

  clear(): void {
    this.store.clear();
  }

  dispose(): void {
    this.store.clear();
  }
}

export class Uri {
  static parse(value: string): Uri {
    const path = value.startsWith("file://") ? value.slice(7) : value;
    return new Uri("file", "", path);
  }

  static file(path: string): Uri {
    return new Uri("file", "", path);
  }

  constructor(
    public readonly scheme: string,
    public readonly authority: string,
    public readonly path: string
  ) {}

  get fsPath(): string {
    return this.path;
  }

  toString(): string {
    return `${this.scheme}://${this.path.startsWith("/") ? this.path.slice(1) : this.path}`;
  }
}

export const languages = {
  createDiagnosticCollection: (name?: string) => new DiagnosticCollection(name || "default"),
  registerCodeActionsProvider: () => ({ dispose: () => {} }),
  registerHoverProvider: () => ({ dispose: () => {} }),
};

export const window = {
  showInformationMessage: async (...args: any[]): Promise<any> => undefined,
  showWarningMessage: async (...args: any[]): Promise<any> => undefined,
  showErrorMessage: async (...args: any[]): Promise<any> => undefined,
  createStatusBarItem: () => ({
    text: "",
    tooltip: "",
    command: "",
    show: () => {},
    hide: () => {},
    dispose: () => {},
  }),
  activeTextEditor: undefined as any,
  visibleTextEditors: [] as any[],
  withProgress: async (options: any, task: (progress: any, token: any) => Promise<any>) => {
    return task({ report: () => {} }, { isCancellationRequested: false });
  },
};

export const workspace = {
  getConfiguration: (section?: string) => ({
    get: (key: string, defaultValue: unknown) => defaultValue,
  }),
  textDocuments: [] as any[],
  openTextDocument: async (uriOrPath: any): Promise<any> => {
    return null;
  },
  findFiles: async (include: string, exclude?: string): Promise<Uri[]> => [],
  applyEdit: async (edit: WorkspaceEdit): Promise<boolean> => true,
};

export const commands = {
  registerCommand: (command: string, callback: (...args: any[]) => any) => ({
    dispose: () => {},
  }),
  executeCommand: async (command: string, ...args: any[]): Promise<any> => undefined,
};
