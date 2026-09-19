/**
 * Robust, syntax-aware scanner and detector for console.log statements.
 * Zero external dependencies.
 * Handles JavaScript, TypeScript, JSX, and TSX.
 */

import { LineIndex } from "./lineIndex";
import { ConsoleLogMatch, SourceRange } from "./types";

const SUPPRESSION_DIRECTIVE = "console-log-janitor-ignore";

function isIdentChar(ch: string): boolean {
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    (ch >= "0" && ch <= "9") ||
    ch === "_" ||
    ch === "$"
  );
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\r" || ch === "\n";
}

export class Detector {
  private readonly source: string;
  private readonly lineIndex: LineIndex;
  private readonly suppressionLines = new Set<number>();

  constructor(source: string) {
    this.source = source;
    this.lineIndex = new LineIndex(source);
  }

  /**
   * Scans the document and returns all detected console.log calls.
   */
  public detect(): ConsoleLogMatch[] {
    const matches: ConsoleLogMatch[] = [];
    const len = this.source.length;
    let i = 0;

    // Track syntactic contexts:
    // We maintain a stack of contexts:
    // - template string interpolation: { type: 'template', braceDepth: number }
    // - jsx element: { type: 'jsx', inTag: boolean, tagBraceDepth: number, tagQuote: string | null }
    // - jsx embedded expression: { type: 'jsx_expr', braceDepth: number }
    interface TemplateContext {
      type: "template";
      braceDepth: number;
    }
    interface JsxContext {
      type: "jsx";
      tagName: string;
      isSelfClosing: boolean;
    }
    interface JsxExprContext {
      type: "jsx_expr";
      braceDepth: number;
    }

    type Context = TemplateContext | JsxContext | JsxExprContext;
    const contextStack: Context[] = [];

    let prevTokenKind: "operator" | "keyword" | "operand" | "open" | "close" | "none" = "none";

    const checkSuppression = (text: string, startOffset: number) => {
      if (text.includes(SUPPRESSION_DIRECTIVE)) {
        const pos = this.lineIndex.positionAt(startOffset);
        this.suppressionLines.add(pos.line);
      }
    };

    // Helper: are we currently in JSX text (children) mode?
    const isInJsxText = (): boolean => {
      if (contextStack.length === 0) return false;
      const top = contextStack[contextStack.length - 1];
      return top.type === "jsx";
    };

    while (i < len) {
      const ch = this.source[i];
      const next = i + 1 < len ? this.source[i + 1] : "";

      // 1. Single-line comment: // ...
      if (ch === "/" && next === "/") {
        const commentStart = i;
        i += 2;
        while (i < len && this.source[i] !== "\n") {
          i++;
        }
        const commentText = this.source.slice(commentStart, i);
        checkSuppression(commentText, commentStart);
        continue;
      }

      // 2. Multi-line comment: /* ... */
      if (ch === "/" && next === "*") {
        const commentStart = i;
        i += 2;
        while (i < len) {
          if (this.source[i] === "*" && i + 1 < len && this.source[i + 1] === "/") {
            i += 2;
            break;
          }
          i++;
        }
        const commentText = this.source.slice(commentStart, i);
        checkSuppression(commentText, commentStart);
        continue;
      }

      // If we are currently in JSX text mode:
      if (isInJsxText()) {
        // In JSX text, only '{' (starts embedded expression) or '<' (starts next tag) exit text mode
        if (ch === "{") {
          contextStack.push({ type: "jsx_expr", braceDepth: 1 });
          i++;
          prevTokenKind = "open";
          continue;
        }

        if (ch === "<") {
          // Could be closing tag </tag> or child opening tag <child>
          if (next === "/") {
            // Closing tag
            i += 2;
            while (i < len && this.source[i] !== ">") {
              i++;
            }
            if (i < len && this.source[i] === ">") {
              i++;
            }
            // Pop the JSX context
            if (contextStack.length > 0 && contextStack[contextStack.length - 1].type === "jsx") {
              contextStack.pop();
            }
            prevTokenKind = "operand";
            continue;
          } else {
            // Child tag
            // Handled below by JSX opening tag logic
          }
        } else {
          // Ordinary character inside JSX text: skip it (never flag console.log in JSX text!)
          i++;
          continue;
        }
      }

      // 3. Single-quote string: '...'
      if (ch === "'") {
        i++;
        while (i < len) {
          if (this.source[i] === "\\") {
            i += 2;
          } else if (this.source[i] === "'") {
            i++;
            break;
          } else if (this.source[i] === "\n") {
            break;
          } else {
            i++;
          }
        }
        prevTokenKind = "operand";
        continue;
      }

      // 4. Double-quote string: "..."
      if (ch === '"') {
        i++;
        while (i < len) {
          if (this.source[i] === "\\") {
            i += 2;
          } else if (this.source[i] === '"') {
            i++;
            break;
          } else if (this.source[i] === "\n") {
            break;
          } else {
            i++;
          }
        }
        prevTokenKind = "operand";
        continue;
      }

      // 5. Template literal: `...`
      if (ch === "`") {
        i++;
        while (i < len) {
          if (this.source[i] === "\\") {
            i += 2;
          } else if (this.source[i] === "`") {
            i++;
            break;
          } else if (this.source[i] === "$" && i + 1 < len && this.source[i + 1] === "{") {
            i += 2;
            contextStack.push({ type: "template", braceDepth: 1 });
            prevTokenKind = "open";
            break;
          } else {
            i++;
          }
        }
        prevTokenKind = "operand";
        continue;
      }

      // Handle template or JSX expression closing via '}'
      if (ch === "}" && contextStack.length > 0) {
        const top = contextStack[contextStack.length - 1];
        if (top.type === "template") {
          top.braceDepth--;
          if (top.braceDepth === 0) {
            contextStack.pop();
            i++;
            // Continue scanning template literal string portion
            while (i < len) {
              if (this.source[i] === "\\") {
                i += 2;
              } else if (this.source[i] === "`") {
                i++;
                break;
              } else if (this.source[i] === "$" && i + 1 < len && this.source[i + 1] === "{") {
                i += 2;
                contextStack.push({ type: "template", braceDepth: 1 });
                prevTokenKind = "open";
                break;
              } else {
                i++;
              }
            }
            prevTokenKind = "operand";
            continue;
          }
        } else if (top.type === "jsx_expr") {
          top.braceDepth--;
          if (top.braceDepth === 0) {
            contextStack.pop();
            i++;
            prevTokenKind = "operand";
            continue;
          }
        }
      }

      // Handle brace increment for template/jsx_expr contexts
      if (ch === "{" && contextStack.length > 0) {
        const top = contextStack[contextStack.length - 1];
        if (top.type === "template" || top.type === "jsx_expr") {
          top.braceDepth++;
        }
      }

      // 6. Regular expression literal: /.../flags
      if (ch === "/") {
        const canBeRegex =
          prevTokenKind === "operator" ||
          prevTokenKind === "keyword" ||
          prevTokenKind === "open" ||
          prevTokenKind === "none";

        if (canBeRegex && next !== "/" && next !== "*") {
          let regIdx = i + 1;
          let inCharClass = false;
          let isRegex = false;

          while (regIdx < len && this.source[regIdx] !== "\n") {
            if (this.source[regIdx] === "\\") {
              regIdx += 2;
            } else if (this.source[regIdx] === "[") {
              inCharClass = true;
              regIdx++;
            } else if (this.source[regIdx] === "]" && inCharClass) {
              inCharClass = false;
              regIdx++;
            } else if (this.source[regIdx] === "/" && !inCharClass) {
              isRegex = true;
              regIdx++;
              while (regIdx < len && this.source[regIdx] >= "a" && this.source[regIdx] <= "z") {
                regIdx++;
              }
              break;
            } else {
              regIdx++;
            }
          }

          if (isRegex) {
            i = regIdx;
            prevTokenKind = "operand";
            continue;
          }
        }
      }

      // 7. JSX Tag Opening check: <tag ...> or <>
      if (ch === "<") {
        // Check if this is likely a JSX opening tag:
        // Must be followed by identifier char (like <div, <App) or > (<>)
        const isTagStart =
          next === ">" ||
          (next >= "a" && next <= "z") ||
          (next >= "A" && next <= "Z") ||
          next === "_";

        const canBeTag =
          prevTokenKind === "operator" ||
          prevTokenKind === "keyword" ||
          prevTokenKind === "open" ||
          prevTokenKind === "none" ||
          isInJsxText();

        if (isTagStart && canBeTag) {
          // Scan until '>' of opening tag
          let tagIdx = i + 1;
          let inAttrQuote: string | null = null;
          let attrBraceDepth = 0;
          let isSelfClosing = false;

          while (tagIdx < len) {
            const tc = this.source[tagIdx];
            if (inAttrQuote !== null) {
              if (tc === "\\") {
                tagIdx += 2;
                continue;
              } else if (tc === inAttrQuote) {
                inAttrQuote = null;
              }
            } else if (attrBraceDepth > 0) {
              if (tc === "{") attrBraceDepth++;
              else if (tc === "}") attrBraceDepth--;
            } else {
              if (tc === '"' || tc === "'") {
                inAttrQuote = tc;
              } else if (tc === "{") {
                attrBraceDepth = 1;
              } else if (tc === "/" && tagIdx + 1 < len && this.source[tagIdx + 1] === ">") {
                isSelfClosing = true;
                tagIdx += 2;
                break;
              } else if (tc === ">") {
                tagIdx++;
                break;
              }
            }
            tagIdx++;
          }

          if (!isSelfClosing) {
            contextStack.push({ type: "jsx", tagName: "", isSelfClosing: false });
          }
          i = tagIdx;
          prevTokenKind = "operand";
          continue;
        }
      }

      // 8. Check for 'console' identifier candidate
      if (ch === "c" && this.source.startsWith("console", i)) {
        const prevChar = i > 0 ? this.source[i - 1] : "";
        let isPrecededByIdent = isIdentChar(prevChar);
        let isPrecededByDot = prevChar === ".";

        if (!isPrecededByIdent && !isPrecededByDot) {
          let back = i - 1;
          while (back >= 0 && (this.source[back] === " " || this.source[back] === "\t")) {
            back--;
          }
          if (
            back >= 0 &&
            (this.source[back] === "." ||
              (this.source[back] === "?" && back > 0 && this.source[back - 1] === "."))
          ) {
            isPrecededByDot = true;
          }
        }

        const charAfterConsole = i + 7 < len ? this.source[i + 7] : "";
        const isFollowedByIdent = isIdentChar(charAfterConsole);

        if (!isPrecededByIdent && !isPrecededByDot && !isFollowedByIdent) {
          const callStartOffset = i;
          let cur = i + 7;

          cur = this.skipWhitespaceAndComments(cur);

          let isOptionalChaining = false;
          let hasAccess = false;

          if (cur < len && this.source.startsWith("?.", cur)) {
            isOptionalChaining = true;
            hasAccess = true;
            cur += 2;
          } else if (cur < len && this.source[cur] === ".") {
            hasAccess = true;
            cur += 1;
          }

          if (hasAccess) {
            cur = this.skipWhitespaceAndComments(cur);

            if (cur < len && this.source.startsWith("log", cur)) {
              const charAfterLog = cur + 3 < len ? this.source[cur + 3] : "";
              if (!isIdentChar(charAfterLog)) {
                cur += 3;
                cur = this.skipWhitespaceAndComments(cur);

                if (cur < len && this.source[cur] === "(") {
                  const parenOpenOffset = cur;
                  const callEndOffset = this.findMatchingParen(parenOpenOffset);

                  if (callEndOffset !== -1) {
                    const statementStartOffset = callStartOffset;
                    let statementEndOffset = callEndOffset;
                    let hasSemicolon = false;

                    let after = callEndOffset;
                    while (
                      after < len &&
                      (this.source[after] === " " || this.source[after] === "\t")
                    ) {
                      after++;
                    }
                    if (after < len && this.source[after] === ";") {
                      hasSemicolon = true;
                      statementEndOffset = after + 1;
                    }

                    const rawArgs = this.source
                      .slice(parenOpenOffset + 1, callEndOffset - 1)
                      .trim();
                    const argsSnippet =
                      rawArgs.length > 40 ? rawArgs.slice(0, 37) + "..." : rawArgs;

                    const callRange = this.lineIndex.rangeAt(callStartOffset, callEndOffset);
                    const statementRange = this.lineIndex.rangeAt(
                      statementStartOffset,
                      statementEndOffset
                    );

                    const isStandaloneLine = this.computeIsStandalone(
                      statementStartOffset,
                      statementEndOffset,
                      statementRange
                    );

                    const isSuppressed =
                      this.suppressionLines.has(statementRange.start.line) ||
                      this.suppressionLines.has(statementRange.start.line - 1);

                    matches.push({
                      callStartOffset,
                      callEndOffset,
                      callRange,
                      statementStartOffset,
                      statementEndOffset,
                      statementRange,
                      argsSnippet,
                      hasSemicolon,
                      isOptionalChaining,
                      isStandaloneLine,
                      isSuppressed,
                    });

                    i = statementEndOffset;
                    prevTokenKind = "operand";
                    continue;
                  }
                }
              }
            }
          }
        }
      }

      // Track keywords vs operands
      if (isIdentChar(ch)) {
        const idStart = i;
        while (i < len && isIdentChar(this.source[i])) {
          i++;
        }
        const idText = this.source.slice(idStart, i);
        if (
          idText === "return" ||
          idText === "case" ||
          idText === "throw" ||
          idText === "yield" ||
          idText === "await" ||
          idText === "typeof" ||
          idText === "void" ||
          idText === "delete" ||
          idText === "default"
        ) {
          prevTokenKind = "keyword";
        } else {
          prevTokenKind = "operand";
        }
        continue;
      }

      if (ch === "(" || ch === "[" || ch === "{") {
        prevTokenKind = "open";
      } else if (ch === ")" || ch === "]") {
        prevTokenKind = "close";
      } else if (
        ch === "=" ||
        ch === "+" ||
        ch === "-" ||
        ch === "*" ||
        ch === "%" ||
        ch === "&" ||
        ch === "|" ||
        ch === "^" ||
        ch === "!" ||
        ch === "~" ||
        ch === "?" ||
        ch === ":" ||
        ch === "," ||
        ch === ";"
      ) {
        prevTokenKind = "operator";
      } else if (!isWhitespace(ch)) {
        prevTokenKind = "none";
      }

      i++;
    }

    // Secondary suppression check pass
    for (const match of matches) {
      if (
        this.suppressionLines.has(match.statementRange.start.line) ||
        this.suppressionLines.has(match.statementRange.start.line - 1)
      ) {
        match.isSuppressed = true;
      }
    }

    return matches;
  }

  private skipWhitespaceAndComments(offset: number): number {
    const len = this.source.length;
    let i = offset;
    while (i < len) {
      const ch = this.source[i];
      const next = i + 1 < len ? this.source[i + 1] : "";

      if (isWhitespace(ch)) {
        i++;
      } else if (ch === "/" && next === "/") {
        i += 2;
        while (i < len && this.source[i] !== "\n") {
          i++;
        }
      } else if (ch === "/" && next === "*") {
        i += 2;
        while (i < len) {
          if (this.source[i] === "*" && i + 1 < len && this.source[i + 1] === "/") {
            i += 2;
            break;
          }
          i++;
        }
      } else {
        break;
      }
    }
    return i;
  }

  private findMatchingParen(openOffset: number): number {
    const len = this.source.length;
    let i = openOffset + 1;
    let parenDepth = 1;

    while (i < len && parenDepth > 0) {
      const ch = this.source[i];
      const next = i + 1 < len ? this.source[i + 1] : "";

      if (ch === "/" && next === "/") {
        i += 2;
        while (i < len && this.source[i] !== "\n") {
          i++;
        }
        continue;
      }
      if (ch === "/" && next === "*") {
        i += 2;
        while (i < len) {
          if (this.source[i] === "*" && i + 1 < len && this.source[i + 1] === "/") {
            i += 2;
            break;
          }
          i++;
        }
        continue;
      }

      if (ch === "'") {
        i++;
        while (i < len) {
          if (this.source[i] === "\\") {
            i += 2;
          } else if (this.source[i] === "'") {
            i++;
            break;
          } else if (this.source[i] === "\n") {
            break;
          } else {
            i++;
          }
        }
        continue;
      }

      if (ch === '"') {
        i++;
        while (i < len) {
          if (this.source[i] === "\\") {
            i += 2;
          } else if (this.source[i] === '"') {
            i++;
            break;
          } else if (this.source[i] === "\n") {
            break;
          } else {
            i++;
          }
        }
        continue;
      }

      if (ch === "`") {
        i++;
        let braceStack = 0;
        while (i < len) {
          if (this.source[i] === "\\") {
            i += 2;
          } else if (this.source[i] === "`" && braceStack === 0) {
            i++;
            break;
          } else if (this.source[i] === "$" && i + 1 < len && this.source[i + 1] === "{") {
            braceStack++;
            i += 2;
          } else if (this.source[i] === "}" && braceStack > 0) {
            braceStack--;
            i++;
          } else {
            i++;
          }
        }
        continue;
      }

      if (ch === "(") {
        parenDepth++;
      } else if (ch === ")") {
        parenDepth--;
        if (parenDepth === 0) {
          return i + 1;
        }
      }

      i++;
    }

    return parenDepth === 0 ? i : -1;
  }

  private computeIsStandalone(
    statementStartOffset: number,
    statementEndOffset: number,
    statementRange: SourceRange
  ): boolean {
    const startLine = statementRange.start.line;
    const endLine = statementRange.end.line;

    const lineStart = this.lineIndex.getLineStartOffset(startLine);
    const beforeText = this.source.slice(lineStart, statementStartOffset);
    if (beforeText.trim().length > 0) {
      return false;
    }

    const lineEnd = this.lineIndex.getLineEndOffset(endLine, false);
    const afterText = this.source.slice(statementEndOffset, lineEnd).trim();

    if (afterText.length === 0 || afterText.startsWith("//")) {
      return true;
    }

    return false;
  }
}
