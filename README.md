# Console.log Janitor

A lightweight, production-ready VS Code extension that automatically detects development `console.log` statements in JavaScript and TypeScript files and lets you safely remove them using native VS Code diagnostics and Code Actions (lightbulb quick-fixes).

---

## Why Console.log Janitor?

During active development and debugging, developers frequently insert `console.log` statements to inspect variables, function arguments, and program flow. Before pushing code to production, these statements must be identified and removed to:

- Keep production browser console and terminal logs clean and readable.
- Prevent accidental disclosure of sensitive internal data, tokens, or user details.
- Avoid unnecessary performance overhead from serialized console output.

### The Old Workflow vs. The Janitor Workflow

- **Before**: Manually run global text searches for `console.log`, wade through comments, strings, and variable names, click through each file, and manually select and delete lines.
- **With Console.log Janitor**: As you write or open code, statements are highlighted with a native VS Code diagnostic squiggle. Hover to inspect, and click the lightbulb (**Quick Fix**) or press `Ctrl+.` / `Cmd+.` to remove the statement instantly.

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

Press `Cmd+.` (macOS) or `Ctrl+.` (Windows/Linux) on any highlighted statement to open the Quick Fix menu:

1. **Remove console.log** *(Preferred)*: Safely removes the full `console.log` statement. If the statement is on its own line, the entire line and indentation are removed so no empty blank lines remain. If surrounded by other code on the same line, the surrounding code is preserved intact.
2. **Ignore this console.log**: Inserts a `// console-log-janitor-ignore` comment directly above the statement to suppress diagnostics for intentional logs.
3. **Remove all console.log statements in this file**: Contextual file-level cleanup. Asks for explicit confirmation stating the exact count of statements to remove, then applies edits safely.
4. **Remove all console.log statements in the workspace**: Contextual workspace-level cleanup. Scans all supported files across the workspace and asks for explicit confirmation stating the total statement count and affected file count before applying edits atomically.

### 4. Status Bar Indicator

A compact indicator in the status bar displays the count of detected `console.log` calls in the active file:
```
$(output) 3 console.log
```
Clicking the status bar item triggers an instant re-scan of the active file.

### 5. Manual Commands (Command Palette)

While the extension is designed around an automatic workflow, manual commands are available via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- `Console.log Janitor: Scan Current File` — Manually re-scans the active document.
- `Console.log Janitor: Scan Workspace` — Scans all JS/TS files in the workspace with progress feedback.
- `Console.log Janitor: Remove console.log Statements from Current File` — Removes all unsuppressed `console.log` statements in the active editor.
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

---

## Configuration

Customize behavior in VS Code Settings (`settings.json`):

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `consoleLogJanitor.enabled` | `boolean` | `true` | Master switch to enable or disable the extension. |
| `consoleLogJanitor.scanOnOpen` | `boolean` | `true` | Automatically scan eligible files when opened. |
| `consoleLogJanitor.scanOnChange` | `boolean` | `true` | Automatically scan eligible files as they are modified. |
| `consoleLogJanitor.scanOnSave` | `boolean` | `true` | Automatically scan eligible files when saved. |
| `consoleLogJanitor.debounceDelayMs` | `integer` | `300` | Debounce delay in milliseconds for typing change events (50–5000 ms). |
| `consoleLogJanitor.severity` | `string` | `"Information"` | Diagnostic severity: `"Information"`, `"Warning"`, `"Error"`, or `"Hint"`. |

---

## Privacy & Security

Console.log Janitor is designed for privacy-conscious developers and enterprise environments:

- **100% Local**: Runs entirely within your local VS Code process.
- **Zero Network Requests**: Makes no network, HTTP, or remote API calls.
- **Zero Telemetry**: Collects no usage data, logs, or analytics.
- **Zero External Services**: No third-party servers or AI APIs are contacted.
- **Zero Shell Execution**: Does not spawn sub-shells or execute CLI binaries.
- **Zero Automatic Modifications**: Never modifies files without explicit user action (e.g. clicking Quick Fix or invoking the manual command).

---

## Installation

### From VSIX
1. Download the `console-log-janitor-1.0.0.vsix` package.
2. Open VS Code.
3. Open the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`).
4. Click the `...` (Views and More Actions) menu in the top right of the Extensions panel.
5. Select **Install from VSIX...** and choose the downloaded file.

Alternatively, install from the terminal:
```bash
code --install-extension console-log-janitor-1.0.0.vsix
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

- **Scope**: Version 1.0 focuses exclusively on `console.log` statements. It intentionally does not flag `console.error`, `console.warn`, `console.info`, or custom logging libraries (e.g. Winston, Pino).
- **Complex AST Transformations**: In expressions where `console.log` is used as an inline return value (e.g. `() => console.log()`), removing the call removes the expression.
- **Language Scope**: Only JavaScript, TypeScript, JSX, and TSX files are scanned. Other languages (Python, Go, Java, PHP, etc.) are out of scope.

---

## Links & Repository

- **Repository**: [https://github.com/AJ-Kaarthick/console-log-janitor](https://github.com/AJ-Kaarthick/console-log-janitor)
- **Issue Tracker**: [https://github.com/AJ-Kaarthick/console-log-janitor/issues](https://github.com/AJ-Kaarthick/console-log-janitor/issues)

---

## License

MIT License © 2026 ajkaarthick
