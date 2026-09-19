import { describe, it, expect } from "vitest";
import { Detector } from "../src/scanner/detector";
import { LineIndex } from "../src/scanner/lineIndex";
import {
  computeRemovalEdit,
  computeBatchRemovalEdits,
  applyEdits,
  computeIgnoreEdit,
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
});
