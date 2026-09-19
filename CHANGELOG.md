# Change Log

All notable changes to the **Console.log Janitor** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-15

### Added
- Syntax-aware detection of `console.log(...)` and optional chaining `console?.log(...)` calls in JavaScript, TypeScript, JSX, and TSX files.
- Robust tokenizer that ignores false positives in single-line comments, block comments, string literals, template literals, variable identifiers (`myConsoleLog`), object receivers (`obj.console.log`), and regular expressions.
- Native VS Code diagnostics with configurable severity (`Information`, `Warning`, `Error`, `Hint`).
- Native QuickFix Code Actions (lightbulb):
  - **Remove console.log** (preferred): safely removes complete statements and eliminates blank lines while preserving surrounding indentation and code.
  - **Ignore this console.log**: inserts inline suppression directive `// console-log-janitor-ignore`.
  - **Remove all console.log statements in this file**: batch cleanup with explicit confirmation stating the number of statements.
  - **Remove all console.log statements in the workspace**: atomic workspace cleanup with explicit confirmation stating statement and affected file counts.
- Informative hover provider detailing statement context and recommended action.
- Status bar indicator displaying detected statement counts for the active editor with one-click re-scan.
- Manual Command Palette actions:
  - `Console.log Janitor: Scan Current File`
  - `Console.log Janitor: Scan Workspace`
  - `Console.log Janitor: Remove console.log Statements from Current File`
  - `Console.log Janitor: Clear Diagnostics`
- Comprehensive settings for scan-on-open, scan-on-change (debounced), scan-on-save, debounce duration, and diagnostic severity.
- 100% local, zero-telemetry, zero-network architecture.
