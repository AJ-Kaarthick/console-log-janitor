import { describe, it, expect } from "vitest";
import { Detector } from "../src/scanner/detector";

describe("Detector - Core Detection", () => {
  it("detects basic console.log with a string literal", () => {
    const code = 'console.log("hello");';
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(1);
    expect(matches[0].argsSnippet).toBe('"hello"');
    expect(matches[0].hasSemicolon).toBe(true);
    expect(matches[0].isOptionalChaining).toBe(false);
  });

  it("detects console.log with variable argument", () => {
    const code = "console.log(variable);";
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(1);
    expect(matches[0].argsSnippet).toBe("variable");
    expect(matches[0].hasSemicolon).toBe(true);
  });

  it("detects console.log with string and variable", () => {
    const code = 'console.log("value:", value);';
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(1);
    expect(matches[0].argsSnippet).toBe('"value:", value');
  });

  it("detects console.log with multiple arguments (a, b, c)", () => {
    const code = "console.log(a, b, c);";
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(1);
    expect(matches[0].argsSnippet).toBe("a, b, c");
  });

  it("detects console.log with optional chaining console?.log(...)", () => {
    const code = 'console?.log("optional safe call");';
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(1);
    expect(matches[0].isOptionalChaining).toBe(true);
    expect(matches[0].argsSnippet).toBe('"optional safe call"');
  });

  it("detects console.log without semicolon", () => {
    const code = 'console.log("no semicolon")\nconst x = 1;';
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(1);
    expect(matches[0].hasSemicolon).toBe(false);
    expect(matches[0].callEndOffset).toBe(matches[0].statementEndOffset);
  });

  it("detects console.log with whitespace variations", () => {
    const code = 'console  .  log  (  "spaced"  )  ;';
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(1);
    expect(matches[0].hasSemicolon).toBe(true);
  });

  it("detects multiline console.log statements", () => {
    const code = `console.log(
  "line 1",
  "line 2",
  { key: "val" }
);`;
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(1);
    expect(matches[0].callRange.start.line).toBe(0);
    expect(matches[0].callRange.end.line).toBe(4);
    expect(matches[0].isStandaloneLine).toBe(true);
  });

  it("detects console.log with object literals and arrays", () => {
    const code = 'console.log({ user: "Alice", roles: ["admin", "editor"] });';
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(1);
  });

  it("detects console.log with nested parentheses and arithmetic", () => {
    const code = "console.log(((1 + 2) * (3 + 4)) / 2);";
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(1);
  });

  it("detects console.log with arrow function argument", () => {
    const code = "console.log(() => { return 42; });";
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(1);
  });

  it("detects console.log with template string argument containing expressions", () => {
    const code = 'console.log(`User ID: ${userId} (${role})`);';
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(1);
  });

  it("detects multiple console.log calls across multiple lines", () => {
    const code = `function test() {
  console.log("start");
  const a = 1;
  console.log("middle", a);
  return a;
  console.log("end");
}`;
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(3);
    expect(matches[0].callRange.start.line).toBe(1);
    expect(matches[1].callRange.start.line).toBe(3);
    expect(matches[2].callRange.start.line).toBe(5);
  });

  it("detects multiple console.log calls on the same line", () => {
    const code = 'console.log(1); console.log(2);';
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(2);
    expect(matches[0].statementRange.start.line).toBe(0);
    expect(matches[1].statementRange.start.line).toBe(0);
  });

  it("detects console.log inside JSX expression", () => {
    const code = `function Component() {
  return (
    <div>
      {console.log("inside JSX expression")}
    </div>
  );
}`;
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(1);
    expect(matches[0].argsSnippet).toBe('"inside JSX expression"');
  });
});
