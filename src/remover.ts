/**
 * Safe statement removal and edit calculation for console.log statements.
 * Preserves indentation, surrounding code, and cleanly eliminates empty lines.
 */

import { LineIndex } from "./scanner/lineIndex";
import { ConsoleLogMatch, TextEditOperation } from "./scanner/types";

/**
 * Computes a single TextEditOperation to remove a detected console.log statement.
 */
export function computeRemovalEdit(
  source: string,
  match: ConsoleLogMatch,
  lineIndex: LineIndex
): TextEditOperation {
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
    if (startLine > 0) {
      // Remove from the end of the previous line (including newline) to end of file
      const prevLineEnd = lineIndex.getLineEndOffset(startLine - 1, false);
      return {
        startOffset: prevLineEnd,
        endOffset: len,
        newText: "",
      };
    }

    // Document contains ONLY this statement
    return {
      startOffset: 0,
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
 * Computes TextEditOperations to remove all provided matches.
 * Edits are sorted in descending order of start offset so applying them
 * sequentially from bottom to top preserves offset integrity.
 */
export function computeBatchRemovalEdits(
  source: string,
  matches: ConsoleLogMatch[],
  lineIndex: LineIndex
): TextEditOperation[] {
  // Sort descending by statementStartOffset
  const sorted = [...matches].sort(
    (a, b) => b.statementStartOffset - a.statementStartOffset
  );

  const edits: TextEditOperation[] = [];

  for (const match of sorted) {
    edits.push(computeRemovalEdit(source, match, lineIndex));
  }

  return edits;
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
