import { describe, it, expect } from "vitest";
import { Detector } from "../src/scanner/detector";
import { LineIndex } from "../src/scanner/lineIndex";
import {
  computeRemovalEdit,
  computeBatchRemovalEdits,
  applyEdits,
  computeIgnoreEdit,
  computeFileDisableEdit,
  analyzeContext,
} from "../src/remover";

describe("Remover - Statement Removal & Formatting Preservation", () => {
  it("removes single-line standalone statement cleanly leaving no blank line", () => {
    const code = `function test() {
  console.log("hello");
  const x = 1;
  return x;
}`;
    const detector = new Detector(code);
    const matches = detector.detect();
    expect(matches).toHaveLength(1);

    const lineIndex = new LineIndex(code);
    const edit = computeRemovalEdit(code, matches[0], lineIndex);
    const result = applyEdits(code, [edit]);

    const expected = `function test() {
  const x = 1;
  return x;
}`;
    expect(result).toBe(expected);
  });

  it("removes standalone statement without semicolon cleanly", () => {
    const code = `const a = 1;
console.log("no semicolon")
const b = 2;`;
    const detector = new Detector(code);
    const matches = detector.detect();
    expect(matches).toHaveLength(1);

    const lineIndex = new LineIndex(code);
    const edit = computeRemovalEdit(code, matches[0], lineIndex);
    const result = applyEdits(code, [edit]);

    const expected = `const a = 1;
const b = 2;`;
    expect(result).toBe(expected);
  });

  it("removes multiline statement completely preserving surrounding code", () => {
    const code = `function processData(data) {
  console.log(
    "Data received:",
    data,
    { timestamp: Date.now() }
  );
  return data.map(x => x * 2);
}`;
    const detector = new Detector(code);
    const matches = detector.detect();
    expect(matches).toHaveLength(1);

    const lineIndex = new LineIndex(code);
    const edit = computeRemovalEdit(code, matches[0], lineIndex);
    const result = applyEdits(code, [edit]);

    const expected = `function processData(data) {
  return data.map(x => x * 2);
}`;
    expect(result).toBe(expected);
  });

  it("removes inline statement when other code follows on same line", () => {
    const code = `console.log("hello"); const x = 1;`;
    const detector = new Detector(code);
    const matches = detector.detect();
    expect(matches).toHaveLength(1);
    expect(matches[0].isStandaloneLine).toBe(false);

    const lineIndex = new LineIndex(code);
    const edit = computeRemovalEdit(code, matches[0], lineIndex);
    const result = applyEdits(code, [edit]);

    expect(result).toBe(`const x = 1;`);
  });

  it("removes inline statement when other code precedes on same line", () => {
    const code = `const a = 1; console.log(a);`;
    const detector = new Detector(code);
    const matches = detector.detect();
    expect(matches).toHaveLength(1);
    expect(matches[0].isStandaloneLine).toBe(false);

    const lineIndex = new LineIndex(code);
    const edit = computeRemovalEdit(code, matches[0], lineIndex);
    const result = applyEdits(code, [edit]);

    expect(result).toBe(`const a = 1;`);
  });

  it("removes inline statement when code both precedes and follows on same line", () => {
    const code = `const a = 1; console.log(a); const b = 2;`;
    const detector = new Detector(code);
    const matches = detector.detect();
    expect(matches).toHaveLength(1);

    const lineIndex = new LineIndex(code);
    const edit = computeRemovalEdit(code, matches[0], lineIndex);
    const result = applyEdits(code, [edit]);

    expect(result).toBe(`const a = 1; const b = 2;`);
  });

  it("removes multiple statements in batch without offset corruption", () => {
    const code = `console.log("first");
function calc(n) {
  console.log("calculating for", n);
  const res = n * 2;
  console.log("result:", res);
  return res;
}
console.log("end");`;

    const detector = new Detector(code);
    const matches = detector.detect();
    expect(matches).toHaveLength(4);

    const lineIndex = new LineIndex(code);
    const edits = computeBatchRemovalEdits(code, matches, lineIndex);
    const result = applyEdits(code, edits);

    const expected = `function calc(n) {
  const res = n * 2;
  return res;
}`;
    expect(result).toBe(expected);
  });

  it("handles standalone statement as the only line in the file", () => {
    const code = 'console.log("only line");';
    const detector = new Detector(code);
    const matches = detector.detect();
    expect(matches).toHaveLength(1);

    const lineIndex = new LineIndex(code);
    const edit = computeRemovalEdit(code, matches[0], lineIndex);
    const result = applyEdits(code, [edit]);

    expect(result).toBe("");
  });

  it("handles standalone statement at the end of file without trailing newline", () => {
    const code = `const x = 1;\nconsole.log("last line")`;
    const detector = new Detector(code);
    const matches = detector.detect();
    expect(matches).toHaveLength(1);

    const lineIndex = new LineIndex(code);
    const edit = computeRemovalEdit(code, matches[0], lineIndex);
    const result = applyEdits(code, [edit]);

    expect(result).toBe("const x = 1;");
  });

  it("computes ignore comment edit with proper indentation", () => {
    const code = `function test() {
    console.log("indented");
}`;
    const detector = new Detector(code);
    const matches = detector.detect();
    expect(matches).toHaveLength(1);

    const lineIndex = new LineIndex(code);
    const edit = computeIgnoreEdit(code, matches[0], lineIndex);
    const result = applyEdits(code, [edit]);

    const expected = `function test() {
    // console-log-janitor-ignore
    console.log("indented");
}`;
    expect(result).toBe(expected);
  });

  describe("Safety - Concise Arrow Functions", () => {
    it("safely removes normal concise arrow body with semicolon", () => {
      const code = `const notify = () => console.log("event");`;
      const detector = new Detector(code);
      const matches = detector.detect();
      expect(matches).toHaveLength(1);

      const lineIndex = new LineIndex(code);
      const edit = computeRemovalEdit(code, matches[0], lineIndex);
      const result = applyEdits(code, [edit]);

      expect(result).toBe(`const notify = () => {};`);
    });

    it("safely removes concise arrow body without semicolon", () => {
      const code = `const notify = () => console.log("event")`;
      const detector = new Detector(code);
      const matches = detector.detect();
      expect(matches).toHaveLength(1);

      const lineIndex = new LineIndex(code);
      const edit = computeRemovalEdit(code, matches[0], lineIndex);
      const result = applyEdits(code, [edit]);

      expect(result).toBe(`const notify = () => {}`);
    });

    it("safely removes parameterized arrow body", () => {
      const code = `const logItem = (item, idx) => console.log(item, idx);`;
      const detector = new Detector(code);
      const matches = detector.detect();
      expect(matches).toHaveLength(1);

      const lineIndex = new LineIndex(code);
      const edit = computeRemovalEdit(code, matches[0], lineIndex);
      const result = applyEdits(code, [edit]);

      expect(result).toBe(`const logItem = (item, idx) => {};`);
    });

    it("safely removes async arrow body", () => {
      const code = `const fetchAndLog = async () => console.log("loading");`;
      const detector = new Detector(code);
      const matches = detector.detect();
      expect(matches).toHaveLength(1);

      const lineIndex = new LineIndex(code);
      const edit = computeRemovalEdit(code, matches[0], lineIndex);
      const result = applyEdits(code, [edit]);

      expect(result).toBe(`const fetchAndLog = async () => {};`);
    });

    it("safely removes multiline concise arrow body preserving line structure", () => {
      const code = `const render = () =>
  console.log("rendering");`;
      const detector = new Detector(code);
      const matches = detector.detect();
      expect(matches).toHaveLength(1);

      const lineIndex = new LineIndex(code);
      const edit = computeRemovalEdit(code, matches[0], lineIndex);
      const result = applyEdits(code, [edit]);

      expect(result).toBe(`const render = () =>
  {};`);
    });

    it("safely removes nested arrow bodies", () => {
      const code = `const curried = () => () => console.log("nested");`;
      const detector = new Detector(code);
      const matches = detector.detect();
      expect(matches).toHaveLength(1);

      const lineIndex = new LineIndex(code);
      const edit = computeRemovalEdit(code, matches[0], lineIndex);
      const result = applyEdits(code, [edit]);

      expect(result).toBe(`const curried = () => () => {};`);

      const blockCode = `const outer = () => {
  const inner = () => console.log("inner");
};`;
      const blockDet = new Detector(blockCode);
      const blockMatches = blockDet.detect();
      expect(blockMatches).toHaveLength(1);

      const blockLineIndex = new LineIndex(blockCode);
      const blockEdit = computeRemovalEdit(blockCode, blockMatches[0], blockLineIndex);
      const blockResult = applyEdits(blockCode, [blockEdit]);

      expect(blockResult).toBe(`const outer = () => {
  const inner = () => {};
};`);
    });
  });

  describe("Safety - Unbraced Control Flow", () => {
    it("safely removes unbraced multiline if body without shifting next statement", () => {
      const code = `if (hasError)
  console.log("Error occurred");
processNextItem();`;
      const detector = new Detector(code);
      const matches = detector.detect();
      expect(matches).toHaveLength(1);

      const lineIndex = new LineIndex(code);
      const edit = computeRemovalEdit(code, matches[0], lineIndex);
      const result = applyEdits(code, [edit]);

      const expected = `if (hasError)
  {}
processNextItem();`;
      expect(result).toBe(expected);
    });

    it("safely removes unbraced inline if body", () => {
      const code = `if (hasError) console.log("Error occurred");
processNextItem();`;
      const detector = new Detector(code);
      const matches = detector.detect();
      expect(matches).toHaveLength(1);

      const lineIndex = new LineIndex(code);
      const edit = computeRemovalEdit(code, matches[0], lineIndex);
      const result = applyEdits(code, [edit]);

      const expected = `if (hasError) {}
processNextItem();`;
      expect(result).toBe(expected);
    });

    it("safely removes unbraced multiline else body", () => {
      const code = `if (ok) {
  run();
} else
  console.log("fallback");
next();`;
      const detector = new Detector(code);
      const matches = detector.detect();
      expect(matches).toHaveLength(1);

      const lineIndex = new LineIndex(code);
      const edit = computeRemovalEdit(code, matches[0], lineIndex);
      const result = applyEdits(code, [edit]);

      const expected = `if (ok) {
  run();
} else
  {}
next();`;
      expect(result).toBe(expected);
    });

    it("safely removes unbraced inline else body", () => {
      const code = `if (ok) run(); else console.log("fallback");
next();`;
      const detector = new Detector(code);
      const matches = detector.detect();
      expect(matches).toHaveLength(1);

      const lineIndex = new LineIndex(code);
      const edit = computeRemovalEdit(code, matches[0], lineIndex);
      const result = applyEdits(code, [edit]);

      const expected = `if (ok) run(); else {}
next();`;
      expect(result).toBe(expected);
    });

    it("safely removes unbraced multiline while loop body", () => {
      const code = `while (busy)
  console.log("waiting");
doNext();`;
      const detector = new Detector(code);
      const matches = detector.detect();
      expect(matches).toHaveLength(1);

      const lineIndex = new LineIndex(code);
      const edit = computeRemovalEdit(code, matches[0], lineIndex);
      const result = applyEdits(code, [edit]);

      const expected = `while (busy)
  {}
doNext();`;
      expect(result).toBe(expected);
    });

    it("safely removes unbraced multiline for loop body", () => {
      const code = `for (let i = 0; i < 10; i++)
  console.log(i);
done();`;
      const detector = new Detector(code);
      const matches = detector.detect();
      expect(matches).toHaveLength(1);

      const lineIndex = new LineIndex(code);
      const edit = computeRemovalEdit(code, matches[0], lineIndex);
      const result = applyEdits(code, [edit]);

      const expected = `for (let i = 0; i < 10; i++)
  {}
done();`;
      expect(result).toBe(expected);
    });

    it("safely removes unbraced do...while loop body", () => {
      const code = `do
  console.log("polling");
while (condition);`;
      const detector = new Detector(code);
      const matches = detector.detect();
      expect(matches).toHaveLength(1);

      const lineIndex = new LineIndex(code);
      const edit = computeRemovalEdit(code, matches[0], lineIndex);
      const result = applyEdits(code, [edit]);

      const expected = `do
  {}
while (condition);`;
      expect(result).toBe(expected);
    });

    it("conservatively refuses transformation when context cannot be proven safe", () => {
      // If preceded directly by an unresolved control keyword
      const ctx = analyzeContext("if console.log(1)", 3);
      expect(ctx.isRefused).toBe(true);
      expect(ctx.isProvenSafe).toBe(false);
    });
  });

  describe("File-Level Disable Directive Edit", () => {
    it("inserts disable directive at top of standard file", () => {
      const code = `const a = 1;\nconsole.log(a);`;
      const edit = computeFileDisableEdit(code);
      const result = applyEdits(code, [edit]);

      expect(result).toBe(`// console-log-janitor-disable\nconst a = 1;\nconsole.log(a);`);
    });

    it("preserves CRLF line endings when inserting directive", () => {
      const code = `const a = 1;\r\nconsole.log(a);`;
      const edit = computeFileDisableEdit(code);
      const result = applyEdits(code, [edit]);

      expect(result).toBe(`// console-log-janitor-disable\r\nconst a = 1;\r\nconsole.log(a);`);
    });

    it("preserves shebang by inserting directive on the line immediately below #!", () => {
      const code = `#!/usr/bin/env node\nconst a = 1;\nconsole.log(a);`;
      const edit = computeFileDisableEdit(code);
      const result = applyEdits(code, [edit]);

      expect(result).toBe(`#!/usr/bin/env node\n// console-log-janitor-disable\nconst a = 1;\nconsole.log(a);`);
      expect(result.startsWith("#!/usr/bin/env node\n")).toBe(true);
    });
  });

  describe("Batch Removal", () => {
    it("computes non-overlapping edits for 5 console.logs without trailing newline", () => {
      const code = `console.log("1");\nconsole.log("2");\nconsole.log("3");\nconsole.log("4");\nconsole.log("5");`;
      const detector = new Detector(code);
      const matches = detector.detect();
      expect(matches).toHaveLength(5);

      const lineIndex = new LineIndex(code);
      const edits = computeBatchRemovalEdits(code, matches, lineIndex);

      // Verify all edits are strictly non-overlapping
      const sorted = [...edits].sort((a, b) => a.startOffset - b.startOffset);
      for (let i = 0; i < sorted.length - 1; i++) {
        expect(sorted[i + 1].startOffset).toBeGreaterThanOrEqual(sorted[i].endOffset);
      }

      const result = applyEdits(code, edits);
      expect(result).toBe("");
    });

    it("computes non-overlapping edits for 5 console.logs with trailing newline", () => {
      const code = `console.log("1");\nconsole.log("2");\nconsole.log("3");\nconsole.log("4");\nconsole.log("5");\n`;
      const detector = new Detector(code);
      const matches = detector.detect();
      expect(matches).toHaveLength(5);

      const lineIndex = new LineIndex(code);
      const edits = computeBatchRemovalEdits(code, matches, lineIndex);

      const sorted = [...edits].sort((a, b) => a.startOffset - b.startOffset);
      for (let i = 0; i < sorted.length - 1; i++) {
        expect(sorted[i + 1].startOffset).toBeGreaterThanOrEqual(sorted[i].endOffset);
      }

      const result = applyEdits(code, edits);
      expect(result).toBe("");
    });

    it("computes reconciled non-overlapping edits for multiple console.logs on the same line", () => {
      const code = `console.log("1"); console.log("2");`;
      const detector = new Detector(code);
      const matches = detector.detect();
      expect(matches).toHaveLength(2);

      const lineIndex = new LineIndex(code);
      const edits = computeBatchRemovalEdits(code, matches, lineIndex);

      const sorted = [...edits].sort((a, b) => a.startOffset - b.startOffset);
      for (let i = 0; i < sorted.length - 1; i++) {
        expect(sorted[i + 1].startOffset).toBeGreaterThanOrEqual(sorted[i].endOffset);
      }

      const result = applyEdits(code, edits);
      expect(result.trim()).toBe("");
    });
  });
});
