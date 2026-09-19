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
