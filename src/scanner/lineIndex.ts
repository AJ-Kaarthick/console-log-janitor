/**
 * Utility for fast line/character <-> offset conversions.
 */

import { SourcePosition, SourceRange } from "./types";

export class LineIndex {
  private lineStarts: number[];
  readonly text: string;

  constructor(text: string) {
    this.text = text;
    this.lineStarts = [0];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\n") {
        this.lineStarts.push(i + 1);
      }
    }
  }

  get lineCount(): number {
    return this.lineStarts.length;
  }

  getLineStartOffset(line: number): number {
    if (line <= 0) return 0;
    if (line >= this.lineStarts.length) return this.text.length;
    return this.lineStarts[line];
  }

  getLineEndOffset(line: number, includeNewline: boolean = false): number {
    if (line < 0) return 0;
    if (line >= this.lineStarts.length - 1) {
      return this.text.length;
    }
    const nextLineStart = this.lineStarts[line + 1];
    if (includeNewline) {
      return nextLineStart;
    }
    // Exclude \r?\n
    let end = nextLineStart - 1;
    if (end > 0 && this.text[end - 1] === "\r") {
      end--;
    }
    return end;
  }

  getLineText(line: number): string {
    const start = this.getLineStartOffset(line);
    const end = this.getLineEndOffset(line, false);
    return this.text.slice(start, end);
  }

  positionAt(offset: number): SourcePosition {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    // Binary search for the line
    let low = 0;
    let high = this.lineStarts.length - 1;
    let line = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.lineStarts[mid] <= clamped) {
        line = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const character = clamped - this.lineStarts[line];
    return { line, character, offset: clamped };
  }

  rangeAt(startOffset: number, endOffset: number): SourceRange {
    return {
      start: this.positionAt(startOffset),
      end: this.positionAt(endOffset),
    };
  }
}
