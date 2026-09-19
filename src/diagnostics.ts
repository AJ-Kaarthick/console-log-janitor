/**
 * Diagnostics management and hover provider for Console.log Janitor.
 */

import * as vscode from "vscode";
import { getConfig, isSupportedLanguage, toVscodeSeverity } from "./config";
import { Detector } from "./scanner/detector";
import { ConsoleLogMatch } from "./scanner/types";

export const DIAGNOSTIC_CODE_REMOVE = "remove-console-log";
export const DIAGNOSTIC_SOURCE = "Console.log Janitor";
export const DIAGNOSTIC_MESSAGE = "console.log detected — remove before production.";

export class DiagnosticsManager {
  private readonly collection: vscode.DiagnosticCollection;
  // Cache active matches per document URI for fast access by CodeActions and Status Bar
  private readonly matchesCache = new Map<string, ConsoleLogMatch[]>();

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection("consoleLogJanitor");
  }

  public getCollection(): vscode.DiagnosticCollection {
    return this.collection;
  }

  public getMatches(uri: vscode.Uri): ConsoleLogMatch[] {
    return this.matchesCache.get(uri.toString()) || [];
  }

  /**
   * Scans a text document and updates diagnostics.
   * Returns detected unsuppressed matches.
   */
  public updateDiagnostics(document: vscode.TextDocument): ConsoleLogMatch[] {
    const config = getConfig();

    if (!config.enabled || !isSupportedLanguage(document.languageId)) {
      this.clearDocument(document.uri);
      return [];
    }

    const text = document.getText();
    const detector = new Detector(text);
    const allMatches = detector.detect();

    // Cache all matches (including suppressed for code action / ignore queries)
    this.matchesCache.set(document.uri.toString(), allMatches);

    // Filter to unsuppressed matches for diagnostics
    const activeMatches = allMatches.filter((m) => !m.isSuppressed);

    const diagnostics: vscode.Diagnostic[] = activeMatches.map((match) => {
      const range = new vscode.Range(
        match.callRange.start.line,
        match.callRange.start.character,
        match.callRange.end.line,
        match.callRange.end.character
      );

      const diagnostic = new vscode.Diagnostic(
        range,
        DIAGNOSTIC_MESSAGE,
        toVscodeSeverity(config.severity)
      );

      diagnostic.source = DIAGNOSTIC_SOURCE;
      diagnostic.code = DIAGNOSTIC_CODE_REMOVE;

      return diagnostic;
    });

    this.collection.set(document.uri, diagnostics);
    return activeMatches;
  }

  public clearDocument(uri: vscode.Uri): void {
    this.collection.delete(uri);
    this.matchesCache.delete(uri.toString());
  }

  public clearAll(): void {
    this.collection.clear();
    this.matchesCache.clear();
  }

  public dispose(): void {
    this.collection.dispose();
    this.matchesCache.clear();
  }
}

/**
 * Hover provider explaining detected console.log calls.
 */
export class ConsoleLogHoverProvider implements vscode.HoverProvider {
  private readonly diagnosticsManager: DiagnosticsManager;

  constructor(diagnosticsManager: DiagnosticsManager) {
    this.diagnosticsManager = diagnosticsManager;
  }

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Hover> {
    if (!isSupportedLanguage(document.languageId)) {
      return null;
    }

    const matches = this.diagnosticsManager.getMatches(document.uri);
    const offset = document.offsetAt(position);

    const match = matches.find(
      (m) => offset >= m.callStartOffset && offset <= m.callEndOffset
    );

    if (!match || match.isSuppressed) {
      return null;
    }

    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.appendMarkdown(`**Console.log Janitor**\n\n`);
    markdown.appendMarkdown(`Development \`console.log\` call detected.\n\n`);
    if (match.argsSnippet) {
      markdown.appendCodeblock(`console.log(${match.argsSnippet})`, "typescript");
    }
    markdown.appendMarkdown(
      `Remove before shipping to production to keep terminal output clean and avoid leaking runtime data.\n\n`
    );
    markdown.appendMarkdown(`💡 *Click the lightbulb icon (Quick Fix) to safely remove or suppress this statement.*`);

    const range = new vscode.Range(
      match.callRange.start.line,
      match.callRange.start.character,
      match.callRange.end.line,
      match.callRange.end.character
    );

    return new vscode.Hover(markdown, range);
  }
}
