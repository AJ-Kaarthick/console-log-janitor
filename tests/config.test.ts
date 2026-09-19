import { describe, it, expect } from "vitest";
import { isSupportedLanguage, toVscodeSeverity } from "../src/config";

describe("Configuration & Language Support", () => {
  it("correctly identifies supported languages", () => {
    expect(isSupportedLanguage("javascript")).toBe(true);
    expect(isSupportedLanguage("typescript")).toBe(true);
    expect(isSupportedLanguage("javascriptreact")).toBe(true);
    expect(isSupportedLanguage("typescriptreact")).toBe(true);
  });

  it("rejects unsupported languages", () => {
    expect(isSupportedLanguage("python")).toBe(false);
    expect(isSupportedLanguage("html")).toBe(false);
    expect(isSupportedLanguage("markdown")).toBe(false);
    expect(isSupportedLanguage("json")).toBe(false);
    expect(isSupportedLanguage("csharp")).toBe(false);
  });

  it("maps severity strings to correct numeric values", () => {
    // vscode.DiagnosticSeverity enum:
    // Error = 0, Warning = 1, Information = 2, Hint = 3
    expect(toVscodeSeverity("Error")).toBe(0);
    expect(toVscodeSeverity("Warning")).toBe(1);
    expect(toVscodeSeverity("Information")).toBe(2);
    expect(toVscodeSeverity("Hint")).toBe(3);
  });
});
