/**
 * Typed configuration manager for Console.log Janitor settings.
 */

import * as vscode from "vscode";

export type DiagnosticSeveritySetting = "Information" | "Warning" | "Error" | "Hint";

export interface ExtensionConfig {
  enabled: boolean;
  scanOnOpen: boolean;
  scanOnChange: boolean;
  scanOnSave: boolean;
  debounceDelayMs: number;
  severity: DiagnosticSeveritySetting;
}

export const SUPPORTED_LANGUAGES = [
  "javascript",
  "typescript",
  "javascriptreact",
  "typescriptreact",
];

export function isSupportedLanguage(languageId: string): boolean {
  return SUPPORTED_LANGUAGES.includes(languageId);
}

/**
 * Checks whether a file path or URI is eligible for workspace scanning and cleanup.
 * Automatically excludes declaration files, minified/bundled scripts, and excluded directories.
 */
export function isWorkspaceCleanableFile(pathOrUri: string | vscode.Uri): boolean {
  const filePath = typeof pathOrUri === "string" ? pathOrUri : pathOrUri.fsPath || pathOrUri.path;
  const normalized = filePath.replace(/\\/g, "/");

  // Exclude directories
  if (/(?:^|\/)(?:node_modules|\.git|dist|out|build|coverage)(?:\/|$)/.test(normalized)) {
    return false;
  }

  // Exclude TypeScript declaration files (*.d.ts)
  if (normalized.endsWith(".d.ts")) {
    return false;
  }

  // Exclude minified files (*.min.js, *.min.ts, *.min.jsx, *.min.tsx)
  if (/\.min\.[jt]sx?$/i.test(normalized)) {
    return false;
  }

  // Exclude bundled files (*.bundle.js, *.bundle.ts, *.bundle.jsx, *.bundle.tsx)
  if (/\.bundle\.[jt]sx?$/i.test(normalized)) {
    return false;
  }

  return true;
}

export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration("consoleLogJanitor");

  return {
    enabled: config.get<boolean>("enabled", true),
    scanOnOpen: config.get<boolean>("scanOnOpen", true),
    scanOnChange: config.get<boolean>("scanOnChange", true),
    scanOnSave: config.get<boolean>("scanOnSave", true),
    debounceDelayMs: Math.max(50, Math.min(config.get<number>("debounceDelayMs", 300), 5000)),
    severity: config.get<DiagnosticSeveritySetting>("severity", "Information"),
  };
}

export function toVscodeSeverity(severity: DiagnosticSeveritySetting): vscode.DiagnosticSeverity {
  switch (severity) {
    case "Error":
      return vscode.DiagnosticSeverity.Error;
    case "Warning":
      return vscode.DiagnosticSeverity.Warning;
    case "Hint":
      return vscode.DiagnosticSeverity.Hint;
    case "Information":
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}
