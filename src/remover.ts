/**
 * Safe statement removal and edit calculation for console.log statements.
 * Preserves indentation, surrounding code, and cleanly eliminates empty lines.
 */

import { LineIndex } from "./scanner/lineIndex";
import { ConsoleLogMatch, TextEditOperation } from "./scanner/types";

export interface StatementContext {
  isArrowFunctionBody: boolean;
  isControlFlowBody: boolean;
  isProvenSafe: boolean;
  isRefused: boolean;
}

interface Token {
  text: string;
  kind:
    | "keyword"
    | "ident"
    | "symbol"
    | "arrow"
    | "open_paren"
    | "close_paren"
    | "open_brace"
    | "close_brace"
    | "semicolon";
}

/**
 * Conservatively analyzes the syntactic context immediately preceding a statement.
 * Returns whether the statement is in an unbraced control flow or concise arrow function.
 */
export function analyzeContext(source: string, statementStartOffset: number): StatementContext {
  const tokens: Token[] = [];
  const len = Math.min(source.length, statementStartOffset);
  let i = 0;

  while (i < len) {
    const ch = source[i];
    const next = i + 1 < len ? source[i + 1] : "";

    // Skip whitespace
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      i++;
      continue;
    }

    // Skip single-line comment
    if (ch === "/" && next === "/") {
      i += 2;
      while (i < len && source[i] !== "\n") {
        i++;
      }
      continue;
    }

    // Skip multi-line comment
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < len) {
        if (source[i] === "*" && i + 1 < len && source[i + 1] === "/") {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }

    // Single-quote string
    if (ch === "'") {
      i++;
      while (i < len) {
        if (source[i] === "\\") {
          i += 2;
        } else if (source[i] === "'") {
          i++;
          break;
        } else if (source[i] === "\n") {
          break;
        } else {
          i++;
        }
      }
      continue;
    }

    // Double-quote string
    if (ch === '"') {
      i++;
      while (i < len) {
        if (source[i] === "\\") {
          i += 2;
        } else if (source[i] === '"') {
          i++;
          break;
        } else if (source[i] === "\n") {
          break;
        } else {
          i++;
        }
      }
      continue;
    }

    // Template string
    if (ch === "`") {
      i++;
      let braceStack = 0;
      while (i < len) {
        if (source[i] === "\\") {
          i += 2;
        } else if (source[i] === "`" && braceStack === 0) {
          i++;
          break;
        } else if (source[i] === "$" && i + 1 < len && source[i + 1] === "{") {
          braceStack++;
          i += 2;
        } else if (source[i] === "}" && braceStack > 0) {
          braceStack--;
          i++;
        } else {
          i++;
        }
      }
      continue;
    }

    // Arrow token =>
    if (ch === "=" && next === ">") {
      tokens.push({ text: "=>", kind: "arrow" });
      i += 2;
      continue;
    }

    // Parentheses & Braces
    if (ch === "(") {
      tokens.push({ text: "(", kind: "open_paren" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ text: ")", kind: "close_paren" });
      i++;
      continue;
    }
    if (ch === "{") {
      tokens.push({ text: "{", kind: "open_brace" });
      i++;
      continue;
    }
    if (ch === "}") {
      tokens.push({ text: "}", kind: "close_brace" });
      i++;
      continue;
    }
    if (ch === ";") {
      tokens.push({ text: ";", kind: "semicolon" });
      i++;
      continue;
    }

    // Identifiers & Keywords
    if (
      (ch >= "a" && ch <= "z") ||
      (ch >= "A" && ch <= "Z") ||
      (ch >= "0" && ch <= "9") ||
      ch === "_" ||
      ch === "$"
    ) {
      const start = i;
      while (
        i < len &&
        ((source[i] >= "a" && source[i] <= "z") ||
          (source[i] >= "A" && source[i] <= "Z") ||
          (source[i] >= "0" && source[i] <= "9") ||
          source[i] === "_" ||
          source[i] === "$")
      ) {
        i++;
      }
      const text = source.slice(start, i);
      const isKw = [
        "if",
        "else",
        "while",
        "for",
        "do",
        "return",
        "await",
        "async",
        "function",
        "const",
        "let",
        "var",
        "case",
        "switch",
      ].includes(text);
      tokens.push({ text, kind: isKw ? "keyword" : "ident" });
      continue;
    }

    // Regex literal check: /.../
    if (ch === "/") {
      const prevTok = tokens.length > 0 ? tokens[tokens.length - 1] : null;
      const canBeRegex =
        !prevTok ||
        prevTok.kind === "arrow" ||
        prevTok.kind === "open_paren" ||
        prevTok.kind === "open_brace" ||
        prevTok.kind === "semicolon" ||
        (prevTok.kind === "keyword" && ["return", "case", "await"].includes(prevTok.text));

      if (canBeRegex) {
        let regIdx = i + 1;
        let inCharClass = false;
        let isRegex = false;
        while (regIdx < len && source[regIdx] !== "\n") {
          if (source[regIdx] === "\\") {
            regIdx += 2;
          } else if (source[regIdx] === "[") {
            inCharClass = true;
            regIdx++;
          } else if (source[regIdx] === "]" && inCharClass) {
            inCharClass = false;
            regIdx++;
          } else if (source[regIdx] === "/" && !inCharClass) {
            isRegex = true;
            regIdx++;
            while (regIdx < len && source[regIdx] >= "a" && source[regIdx] <= "z") {
              regIdx++;
            }
            break;
          } else {
            regIdx++;
          }
        }
        if (isRegex) {
          i = regIdx;
          continue;
        }
      }
    }

    // Other symbols (=, +, -, etc.)
    tokens.push({ text: ch, kind: "symbol" });
    i++;
  }

  if (tokens.length === 0) {
    return {
      isArrowFunctionBody: false,
      isControlFlowBody: false,
      isProvenSafe: true,
      isRefused: false,
    };
  }

  const lastToken = tokens[tokens.length - 1];

  // 1. Concise Arrow Function Check: Immediately preceded by =>
  if (lastToken.kind === "arrow") {
    return {
      isArrowFunctionBody: true,
      isControlFlowBody: false,
      isProvenSafe: true,
      isRefused: false,
    };
  }

  // 2. Unbraced Control Flow Check:
  // Directly preceded by 'else'
  if (lastToken.text === "else") {
    return {
      isArrowFunctionBody: false,
      isControlFlowBody: true,
      isProvenSafe: true,
      isRefused: false,
    };
  }

  // Directly preceded by 'do'
  if (lastToken.text === "do") {
    return {
      isArrowFunctionBody: false,
      isControlFlowBody: true,
      isProvenSafe: true,
      isRefused: false,
    };
  }

  // Directly preceded by ')'
  if (lastToken.kind === "close_paren") {
    let depth = 1;
    let openIndex = -1;
    for (let k = tokens.length - 2; k >= 0; k--) {
      if (tokens[k].kind === "close_paren") depth++;
      else if (tokens[k].kind === "open_paren") {
        depth--;
        if (depth === 0) {
          openIndex = k;
          break;
        }
      }
    }

    if (openIndex > 0) {
      const headerToken = tokens[openIndex - 1];
      if (headerToken.text === "if") {
        return {
          isArrowFunctionBody: false,
          isControlFlowBody: true,
          isProvenSafe: true,
          isRefused: false,
        };
      }
      if (headerToken.text === "for") {
        return {
          isArrowFunctionBody: false,
          isControlFlowBody: true,
          isProvenSafe: true,
          isRefused: false,
        };
      }
      if (headerToken.text === "await" && openIndex > 1 && tokens[openIndex - 2]?.text === "for") {
        return {
          isArrowFunctionBody: false,
          isControlFlowBody: true,
          isProvenSafe: true,
          isRefused: false,
        };
      }
      if (headerToken.text === "while") {
        // Ensure not part of 'do { ... } while (...)'
        const prevToWhile = openIndex > 1 ? tokens[openIndex - 2] : null;
        if (!prevToWhile || prevToWhile.kind !== "close_brace") {
          return {
            isArrowFunctionBody: false,
            isControlFlowBody: true,
            isProvenSafe: true,
            isRefused: false,
          };
        }
      }
    }
  }

  // 3. Proven safe for normal statement deletion:
  // Inside a block '{', after a semicolon ';', after a block '}', or at top level
  if (
    lastToken.kind === "open_brace" ||
    lastToken.kind === "semicolon" ||
    lastToken.kind === "close_brace"
  ) {
    return {
      isArrowFunctionBody: false,
      isControlFlowBody: false,
      isProvenSafe: true,
      isRefused: false,
    };
  }

  // Expression statement ending in ')' without semicolon: e.g. foo()\nconsole.log()
  if (lastToken.kind === "close_paren") {
    return {
      isArrowFunctionBody: false,
      isControlFlowBody: false,
      isProvenSafe: true,
      isRefused: false,
    };
  }

  // Preceded by an identifier (e.g. `foo\nconsole.log()` ASI)
  if (lastToken.kind === "ident") {
    return {
      isArrowFunctionBody: false,
      isControlFlowBody: false,
      isProvenSafe: true,
      isRefused: false,
    };
  }

  // Conservative rule: If preceded by control keyword or ambiguous context, refuse removal rather than guessing
  if (["if", "for", "while", "do", "else", "switch", "case"].includes(lastToken.text)) {
    return {
      isArrowFunctionBody: false,
      isControlFlowBody: false,
      isProvenSafe: false,
      isRefused: true,
    };
  }

  return {
    isArrowFunctionBody: false,
    isControlFlowBody: false,
    isProvenSafe: true,
    isRefused: false,
  };
}

/**
 * Computes a single TextEditOperation to remove a detected console.log statement.
 */
export function computeRemovalEdit(
  source: string,
  match: ConsoleLogMatch,
  lineIndex: LineIndex,
  isPrecedingLineRemoved: boolean = false
): TextEditOperation {
  const context = analyzeContext(source, match.statementStartOffset);

  // If context detection could not prove safety, refuse transformation
  if (context.isRefused) {
    return {
      startOffset: match.statementStartOffset,
      endOffset: match.statementStartOffset,
      newText: "",
    };
  }

  // Case A: Concise Arrow Function Body
  // e.g. const f = () => console.log(x); or const f = () => console.log(x)
  if (context.isArrowFunctionBody) {
    return {
      startOffset: match.statementStartOffset,
      endOffset: match.statementEndOffset,
      newText: match.hasSemicolon ? "{};" : "{}",
    };
  }

  // Case B: Unbraced Control Flow Body
  // e.g. if (cond) console.log(x); or if (cond)\n  console.log(x);
  if (context.isControlFlowBody) {
    return {
      startOffset: match.statementStartOffset,
      endOffset: match.statementEndOffset,
      newText: "{}",
    };
  }

  const startLine = match.statementRange.start.line;
  const endLine = match.statementRange.end.line;
  const len = source.length;

  // Case 1: Standalone statement on its own line(s)
  if (match.isStandaloneLine) {
    const lineStart = lineIndex.getLineStartOffset(startLine);

    // If there is a next line, remove up to next line start (including newline)
    if (endLine < lineIndex.lineCount - 1) {
      const nextLineStart = lineIndex.getLineStartOffset(endLine + 1);
      return {
        startOffset: lineStart,
        endOffset: nextLineStart,
        newText: "",
      };
    }

    // This is the last line in the document
    if (startLine > 0 && !isPrecedingLineRemoved) {
      // Remove from the end of the previous line (including newline) to end of file
      const prevLineEnd = lineIndex.getLineEndOffset(startLine - 1, false);
      return {
        startOffset: prevLineEnd,
        endOffset: len,
        newText: "",
      };
    }

    // Document contains ONLY this statement, or preceding line is also being removed in batch
    return {
      startOffset: startLine > 0 ? lineStart : 0,
      endOffset: len,
      newText: "",
    };
  }

  // Case 2: Statement shares line with other code
  const lineStart = lineIndex.getLineStartOffset(startLine);
  const lineEnd = lineIndex.getLineEndOffset(endLine, false);

  const beforeText = source.slice(lineStart, match.statementStartOffset);
  const hasPrecedingCode = beforeText.trim().length > 0;

  const afterText = source.slice(match.statementEndOffset, lineEnd);
  const hasFollowingCode = afterText.trim().length > 0;

  if (hasPrecedingCode && !hasFollowingCode) {
    // Code precedes, nothing follows on this line:
    // Consume leading whitespace on the same line
    let start = match.statementStartOffset;
    while (start > lineStart && (source[start - 1] === " " || source[start - 1] === "\t")) {
      start--;
    }
    return {
      startOffset: start,
      endOffset: match.statementEndOffset,
      newText: "",
    };
  }

  if (!hasPrecedingCode && hasFollowingCode) {
    // No code precedes, code follows on this line:
    // Consume trailing whitespace on the same line
    let end = match.statementEndOffset;
    while (end < lineEnd && (source[end] === " " || source[end] === "\t")) {
      end++;
    }
    return {
      startOffset: match.statementStartOffset,
      endOffset: end,
      newText: "",
    };
  }

  // Code both precedes and follows on the same line:
  // Consume leading whitespace
  let start = match.statementStartOffset;
  while (start > lineStart && (source[start - 1] === " " || source[start - 1] === "\t")) {
    start--;
  }

  // Also consume one trailing space if present
  let end = match.statementEndOffset;
  if (start === match.statementStartOffset && end < lineEnd && source[end] === " ") {
    end++;
  }

  return {
    startOffset: start,
    endOffset: end,
    newText: "",
  };
}

/**
 * Reconciles batch text edit operations by resolving overlapping and subsumed ranges.
 * Preserves adjacent/touching edits and returns operations sorted in descending order of startOffset.
 */
export function reconcileBatchEdits(edits: TextEditOperation[]): TextEditOperation[] {
  if (edits.length <= 1) {
    return edits;
  }

  // Sort ascending by startOffset, then endOffset
  const sorted = [...edits].sort(
    (a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset
  );

  const result: TextEditOperation[] = [];

  for (const edit of sorted) {
    if (result.length === 0) {
      result.push({ ...edit });
      continue;
    }

    const prev = result[result.length - 1];

    // If strictly disjoint (prev ends before edit starts)
    if (prev.endOffset < edit.startOffset) {
      result.push({ ...edit });
      continue;
    }

    // Touching at boundary (prev.endOffset === edit.startOffset)
    if (prev.endOffset === edit.startOffset) {
      result.push({ ...edit });
      continue;
    }

    // Overlapping ranges (prev.endOffset > edit.startOffset)
    // Case 1: Both are pure deletions (newText === "")
    if (prev.newText === "" && edit.newText === "") {
      // Merge into a single contiguous deletion
      prev.endOffset = Math.max(prev.endOffset, edit.endOffset);
      continue;
    }

    // Case 2: One completely contains the other
    if (edit.startOffset >= prev.startOffset && edit.endOffset <= prev.endOffset) {
      if (prev.newText === "") {
        continue;
      }
      continue;
    }

    // Case 3: Overlapping where prev is deletion and edit has replacement text
    if (prev.newText === "" && edit.newText !== "") {
      prev.endOffset = edit.startOffset;
      if (prev.startOffset >= prev.endOffset) {
        result[result.length - 1] = { ...edit };
      } else {
        result.push({ ...edit });
      }
      continue;
    }

    // Case 4: Overlapping where prev has replacement text and edit is deletion
    if (prev.newText !== "" && edit.newText === "") {
      edit.startOffset = prev.endOffset;
      if (edit.startOffset < edit.endOffset) {
        result.push({ ...edit });
      }
      continue;
    }

    // Case 5: Both have replacement text and overlap
    prev.endOffset = Math.max(prev.endOffset, edit.endOffset);
    prev.newText = prev.newText + edit.newText;
  }

  // Sort descending by startOffset so sequential string slicing works in applyEdits
  return result.sort((a, b) => b.startOffset - a.startOffset);
}

/**
 * Computes TextEditOperations to remove all provided matches.
 * Edits are sorted in descending order of start offset so applying them
 * sequentially from bottom to top preserves offset integrity.
 */
export function computeBatchRemovalEdits(
  source: string,
  matches: ConsoleLogMatch[],
  lineIndex: LineIndex
): TextEditOperation[] {
  // Set of lines affected by matches
  const removedLines = new Set<number>();
  for (const match of matches) {
    for (let l = match.statementRange.start.line; l <= match.statementRange.end.line; l++) {
      removedLines.add(l);
    }
  }

  const rawEdits: TextEditOperation[] = [];

  for (const match of matches) {
    const isPrecedingLineRemoved = removedLines.has(match.statementRange.start.line - 1);
    const edit = computeRemovalEdit(source, match, lineIndex, isPrecedingLineRemoved);
    if (edit.startOffset !== edit.endOffset || edit.newText !== "") {
      rawEdits.push(edit);
    }
  }

  return reconcileBatchEdits(rawEdits);
}

/**
 * Applies a list of TextEditOperations to a source string.
 * Edits must be sorted in descending order of startOffset.
 */
export function applyEdits(source: string, edits: TextEditOperation[]): string {
  let result = source;
  for (const edit of edits) {
    result =
      result.slice(0, edit.startOffset) +
      edit.newText +
      result.slice(edit.endOffset);
  }
  return result;
}

/**
 * Computes an edit to insert a suppression directive above the statement.
 */
export function computeIgnoreEdit(
  source: string,
  match: ConsoleLogMatch,
  lineIndex: LineIndex
): TextEditOperation {
  const line = match.statementRange.start.line;
  const lineStart = lineIndex.getLineStartOffset(line);

  // Determine line indentation
  let indentEnd = lineStart;
  while (
    indentEnd < source.length &&
    (source[indentEnd] === " " || source[indentEnd] === "\t")
  ) {
    indentEnd++;
  }
  const indentation = source.slice(lineStart, indentEnd);

  // Determine line ending style (\r\n vs \n)
  const isCrlf = source.includes("\r\n");
  const eol = isCrlf ? "\r\n" : "\n";

  const commentText = `${indentation}// console-log-janitor-ignore${eol}`;

  return {
    startOffset: lineStart,
    endOffset: lineStart,
    newText: commentText,
  };
}

/**
 * Computes an edit to insert a file-level suppression directive at the top of the file.
 * Preserves shebang lines if present.
 */
export function computeFileDisableEdit(source: string): TextEditOperation {
  const isCrlf = source.includes("\r\n");
  const eol = isCrlf ? "\r\n" : "\n";
  const directive = `// console-log-janitor-disable${eol}`;

  if (source.startsWith("#!")) {
    const newlineIndex = source.indexOf("\n");
    const insertOffset = newlineIndex !== -1 ? newlineIndex + 1 : source.length;
    return {
      startOffset: insertOffset,
      endOffset: insertOffset,
      newText: directive,
    };
  }

  return {
    startOffset: 0,
    endOffset: 0,
    newText: directive,
  };
}
