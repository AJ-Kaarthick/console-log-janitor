/**
 * Types and data structures for Console.log Janitor scanner and detector.
 */

export interface SourcePosition {
  /** 0-indexed line */
  line: number;
  /** 0-indexed character offset on the line */
  character: number;
  /** 0-indexed character offset in the entire document */
  offset: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export interface TextEditOperation {
  /** Start character offset in document */
  startOffset: number;
  /** End character offset in document */
  endOffset: number;
  /** Replacement text (usually empty string for deletion) */
  newText: string;
}

export interface ConsoleLogMatch {
  /** The range spanning `console.log(...)` or `console?.log(...)` from `c` to closing `)` */
  callStartOffset: number;
  callEndOffset: number;
  callRange: SourceRange;

  /** The range spanning the full statement including trailing semicolon if present */
  statementStartOffset: number;
  statementEndOffset: number;
  statementRange: SourceRange;

  /** Snippet of the arguments inside `(...)`, truncated if very long */
  argsSnippet: string;

  /** Whether the call ends with a semicolon `;` */
  hasSemicolon: boolean;

  /** Whether the call uses optional chaining `console?.log(...)` */
  isOptionalChaining: boolean;

  /** Whether this call is on a standalone line (only whitespace/indentation around it) */
  isStandaloneLine: boolean;

  /** Whether the match is suppressed by a `// console-log-janitor-ignore` directive */
  isSuppressed: boolean;
}
