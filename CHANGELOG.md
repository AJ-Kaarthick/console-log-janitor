# Change Log

All notable changes to the **Console.log Janitor** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-10-04

### Added
- **Safer Control Flow Handling**: Unbraced control-flow statements (`if`, `else`, `while`, `for`, `do`) containing a solitary `console.log` are safely replaced with `{}` rather than deleted, preventing accidental control-flow shifting and semantic bugs.
- **Concise Arrow Function Safety**: Concise arrow function bodies (`() => console.log(...)`) are replaced with `{}` or `{};` rather than stripped, preserving valid JavaScript/TypeScript syntax returning `undefined`.
- **Conservative Context Detection**: Syntactic context is strictly verified before transformation; ambiguous or unproven contexts are conservatively refused rather than guessed.
- **File-Level Suppression Directive**: Added support for `// console-log-janitor-disable` and `/* console-log-janitor-disable */` to disable scanning, diagnostics, and bulk cleanup for an entire file.
- **File-Level Disable Quick Fix**: Added "Disable Console.log Janitor for this file" lightbulb action that cleanly inserts the directive at the top of the file (preserving any shebang `#!` line).
- **Smart Contextual Quick Fixes**: Omitted redundant "Remove all in this file" when only 1 finding exists; displays dynamic counts (`Remove all N console.log statements in this file`) when multiple findings exist.
- **Reviewable Bulk Cleanup**: Added native VS Code review UI displaying total statement count, affected file count, and concise statement previews before applying edits.
- **Pre-Validation of Workspace Edits**: All batch edits are validated for boundary and content integrity prior to applying; cancellation or validation failure applies zero edits.
- **Safe Workspace Scope**: Automatic exclusion of TypeScript declaration files (`*.d.ts`), minified files (`*.min.js`), bundled scripts (`*.bundle.js`), and `coverage/**` folders during workspace scanning and cleanup.
- **Actionable Status Bar Hub**: Clicking the status bar item opens an instant native QuickPick action menu (Clean File, Clean Workspace, Re-scan, Clear Diagnostics, Open Settings) without disk-scan lag.
- **Command Palette Workspace Cleanup**: Contributed `Console.log Janitor: Remove console.log Statements from Workspace` command.

### Fixed
- **Disjoint Edit Boundary Reconciliation**: Fixed multi-statement removal in single files where adjacent or last-line statement removals could generate overlapping text edit ranges, ensuring full compatibility with VS Code's `WorkspaceEdit` engine.

### Changed
- Expanded automated test suite to 98 tests across 8 test suites covering control flow safety, arrow functions, suppression directives, non-overlapping edit reconciliation, and bulk review flows.

## [1.0.0] - 2026-09-15

### Added
- Syntax-aware detection of `console.log(...)` and optional chaining `console?.log(...)` calls in JavaScript, TypeScript, JSX, and TSX files.
- Robust tokenizer that ignores false positives in single-line comments, block comments, string literals, template literals, variable identifiers (`myConsoleLog`), object receivers (`obj.console.log`), and regular expressions.
- Native VS Code diagnostics with configurable severity (`Information`, `Warning`, `Error`, `Hint`).
- Native QuickFix Code Actions (lightbulb):
  - **Remove console.log** (preferred): safely removes complete statements and eliminates blank lines while preserving surrounding indentation and code.
  - **Ignore this console.log**: inserts inline suppression directive `// console-log-janitor-ignore`.
  - **Remove all console.log statements in this file**: batch cleanup with explicit confirmation stating the number of statements.
  - **Remove all console.log statements in the workspace**: workspace cleanup with explicit confirmation stating statement and affected file counts.
- Informative hover provider detailing statement context and recommended action.
- Status bar indicator displaying detected statement counts for the active editor with one-click re-scan.
- Manual Command Palette actions:
  - `Console.log Janitor: Scan Current File`
  - `Console.log Janitor: Scan Workspace`
  - `Console.log Janitor: Remove console.log Statements from Current File`
  - `Console.log Janitor: Clear Diagnostics`
- Comprehensive settings for scan-on-open, scan-on-change (debounced), scan-on-save, debounce duration, and diagnostic severity.
- Local, zero-telemetry, zero-network architecture.
