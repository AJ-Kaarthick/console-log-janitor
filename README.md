# Console.log Janitor

A lightweight, production-ready VS Code extension that automatically detects development `console.log` statements in JavaScript and TypeScript files and lets you safely remove them using native VS Code diagnostics, Quick Fixes, and reviewable bulk actions.

---

## Why Console.log Janitor?

During active development and debugging, developers frequently insert `console.log` statements to inspect variables, function arguments, and program flow. Before pushing code to production, these statements must be identified and removed to:

- Keep production browser console and terminal logs clean and readable.
- Prevent accidental disclosure of sensitive internal data, tokens, or user details.
- Avoid unnecessary performance overhead from serialized console output.

### The Old Workflow vs. The Janitor Workflow

- **Before**: Manually run global text searches for `console.log`, wade through comments, strings, and variable names, click through each file, and manually select and delete lines.
- **With Console.log Janitor**: As you write or open code, statements are highlighted with a native VS Code diagnostic squiggle. Hover to inspect, and click the lightbulb (**Quick Fix**) or press `Ctrl+.` / `Cmd+.` to remove statements individually or in bulk with preview confirmation.

---

## Core Features

### 1. Automatic Detection Workflow

Console.log Janitor automatically scans eligible files:
- When an eligible file is opened
- As you type (with configurable debouncing so editing stays responsive)
- When a file is saved

The extension runs completely in the background without requiring manual intervention.

### 2. Native Diagnostics & Helpful Hovers

- Detected `console.log` calls are marked with a non-intrusive diagnostic:
  > `console.log detected — remove before production.`
- Hovering over the statement explains why it was flagged and points directly to available Quick Fix actions.
- Configurable severity: `Information` (default), `Warning`, `Error`, or `Hint`.

### 3. Native Lightbulb Code Actions (Quick Fix)

Press `Cmd+.` (macOS) or `Ctrl+.` (Windows/Linux) on any highlighted statement to open the contextual Quick Fix menu:

1. **Remove console.log** *(Preferred)*: Safely removes the full `console.log` statement.
   - **Standalone line**: Entire line and indentation are removed, leaving no blank line.
   - **Concise arrow function**: `() => console.log("x")` is safely replaced with `{}` (or `{};`), maintaining valid syntax and preventing runtime syntax errors.
   - **Unbraced control flow**: Solitary body under `if`, `else`, `while`, `for`, or `do` is safely replaced with `{}` to prevent control-flow shifting and semantic bugs.
   - **Inline code**: Surrounding code and indentation are preserved intact.
   - **Conservative refusal**: If the surrounding syntactic context cannot be proven safe, automatic transformation is refused rather than guessed.
2. **Ignore this console.log**: Inserts a `// console-log-janitor-ignore` comment directly above the statement.
3. **Disable Console.log Janitor for this file**: Inserts `// console-log-janitor-disable` at the top of the file (preserving shebang `#!`), suppressing all diagnostics and cleanup for the file.
4. **Remove all N console.log statements in this file**: Contextually available when multiple findings exist in the file (deduplicated when only 1 finding exists). Displays statement counts and requests confirmation before applying edits.
5. **Remove all console.log statements in the workspace**: Scans eligible workspace files and opens a review dialog displaying statement counts, affected file counts, and statement previews before applying edits.

### 4. Reviewable Bulk Cleanup & Pre-Validation

Bulk cleanup (both current-file and workspace-wide) provides a safe, reviewable workflow:
- **Review Confirmation**: Displays total statement counts, affected file counts, and concise previews of affected code before any changes are made.
- **Pre-Validation**: All edit ranges and boundaries are pre-validated to ensure target slices match and edit ranges are strictly disjoint.
- **Cancel Protection**: Dismissing the prompt or selecting Cancel applies zero edits and leaves all files untouched. If edit validation fails, zero edits are applied.
- **Disjoint Edit Reconciliation**: Multi-statement removals in the same file are reconciled so edits never overlap, ensuring clean application.

### 5. Actionable Status Bar Hub

A compact indicator in the status bar displays the count of detected `console.log` calls in the active file:
```
$(output) 3 console.log
```
Clicking the status bar item opens an instant action hub (zero disk scan delay):
- **Remove all N console.log statements in this file** (contextual, shown when findings exist)
- **Remove all console.log statements in workspace**
- **Re-scan current file**
- **Clear diagnostics**
- **Open Settings**

### 6. Manual Commands (Command Palette)

All actions are accessible via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- `Console.log Janitor: Scan Current File` — Manually re-scans the active document.
- `Console.log Janitor: Scan Workspace` — Scans all eligible JS/TS files in the workspace with progress feedback.
- `Console.log Janitor: Remove console.log Statements from Current File` — Removes all unsuppressed statements in the active editor with review confirmation.
- `Console.log Janitor: Remove console.log Statements from Workspace` — Removes all unsuppressed statements across the workspace with review confirmation.
- `Console.log Janitor: Clear Diagnostics` — Clears all diagnostics.

---

## Supported Languages

Console.log Janitor specifically supports:

- **JavaScript** (`.js`, `.mjs`, `.cjs`)
- **TypeScript** (`.ts`, `.mts`, `.cts`)
- **JSX** (`.jsx`)
- **TSX** (`.tsx`)

---

## Syntax & False-Positive Prevention

Console.log Janitor uses a token-aware scanner designed to detect valid `console.log` statements while strictly avoiding false positives:

### What is Detected
- Standard calls: `console.log("hello");`
- Variable arguments: `console.log(myVar);`
- Multiple arguments: `console.log("user:", user, { active: true });`
- Optional chaining: `console?.log("optional call");`
- Multiline statements spanning several lines
- Statements with or without semicolons

### What is NOT Flagged
- Comments containing text: `// console.log("debug")` or `/* console.log */`
- String literals: `"Use console.log here"` or `'console.log'`
- Template literal strings without interpolation: `` `console.log output` ``
- Variable names: `const myConsoleLog = 1;` or `const consoleLog = 2;`
- Identifiers starting with console: `consoleLogger.info(...)`
- Properties on other objects: `myService.console.log(...)`
- Unrelated methods: `console.error(...)`, `console.warn(...)`, `console.info(...)`
- JSX text content between tags: `<div>console.log("text")</div>`
- Calls suppressed with `// console-log-janitor-ignore`
- Files disabled with `// console-log-janitor-disable` or `/* console-log-janitor-disable */`

### Automatic Workspace Exclusions
Workspace scanning and bulk cleanup automatically exclude:
- TypeScript declaration files (`*.d.ts`)
- Minified scripts (`*.min.js`, `*.min.ts`, `*.min.jsx`, `*.min.tsx`)
- Bundled files (`*.bundle.js`, `*.bundle.ts`, `*.bundle.jsx`, `*.bundle.tsx`)
- Test coverage directories (`coverage/**`)
- Standard build and package folders: `node_modules`, `.git`, `dist`, `out`, `build`

---

## Configuration

Customize behavior in VS Code Settings (`settings.json`):

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `consoleLogJanitor.enabled` | `boolean` | `true` | Master switch to enable or disable the extension. |
| `consoleLogJanitor.scanOnOpen` | `boolean` | `true` | Automatically scan eligible files when opened. |
| `consoleLogJanitor.scanOnChange` | `boolean` | `true` | Automatically scan eligible files as they are modified. |
| `consoleLogJanitor.scanOnSave` | `boolean` | `true` | Automatically scan eligible files when saved. |
| `consoleLogJanitor.debounceDelayMs` | `integer` | `300` | Debounce delay in milliseconds for typing change events (50–3000 ms). |
| `consoleLogJanitor.severity` | `string` | `"Information"` | Diagnostic severity: `"Information"`, `"Warning"`, `"Error"`, or `"Hint"`. |

---

## Privacy & Security

Console.log Janitor is designed for privacy-conscious developers and enterprise environments:

- **Local Execution**: Runs entirely within your local VS Code process.
- **Zero Network Requests**: Makes no network, HTTP, or remote API calls.
- **Zero Telemetry**: Collects no usage data, logs, or analytics.
- **Zero External Services**: No third-party servers or AI APIs are contacted.
- **Zero Shell Execution**: Does not spawn sub-shells or execute CLI binaries.
- **Zero Automatic Modifications**: Never modifies files without explicit user action (e.g. selecting a Quick Fix or invoking a cleanup command).

---

## Installation

### From VSIX
1. Download the `console-log-janitor-1.1.0.vsix` package.
2. Open VS Code.
3. Open the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`).
4. Click the `...` (Views and More Actions) menu in the top right of the Extensions panel.
5. Select **Install from VSIX...** and choose the downloaded file.

Alternatively, install from the terminal:
```bash
code --install-extension console-log-janitor-1.1.0.vsix
```

---

## Development & Testing

To build and run tests locally:

```bash
# Install dependencies
npm install

# Run automated tests (Vitest)
npm run test

# Run TypeScript type check
npm run typecheck

# Build production bundle (esbuild)
npm run build

# Package VSIX
npm run package
```

---

## Known Limitations

- **Scope**: Focuses exclusively on `console.log` statements. It intentionally does not flag `console.error`, `console.warn`, `console.info`, or custom logging libraries (e.g. Winston, Pino).
- **Conservative Safety Refusal**: When removing statements from unbraced control structures or concise arrow functions, the remover requires proven syntactic contexts. If the context is ambiguous, automatic transformation is refused to preserve code semantics.
- **Language Scope**: Only JavaScript, TypeScript, JSX, and TSX files are scanned. Other languages (Python, Go, Java, PHP, etc.) are out of scope.

---

## Links & Repository

- **Repository**: [https://github.com/AJ-Kaarthick/console-log-janitor](https://github.com/AJ-Kaarthick/console-log-janitor)
- **Issue Tracker**: [https://github.com/AJ-Kaarthick/console-log-janitor/issues](https://github.com/AJ-Kaarthick/console-log-janitor/issues)

---

## License

MIT License © 2026 ajkaarthick
