import { describe, it, expect } from "vitest";
import { Detector } from "../src/scanner/detector";

describe("Detector - Suppression Directives", () => {
  it("marks call as suppressed when preceded by // console-log-janitor-ignore", () => {
    const code = `
// console-log-janitor-ignore
console.log("suppressed");
`;
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(1);
    expect(matches[0].isSuppressed).toBe(true);
  });

  it("marks call as suppressed when followed by // console-log-janitor-ignore on same line", () => {
    const code = 'console.log("suppressed"); // console-log-janitor-ignore';
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(1);
    expect(matches[0].isSuppressed).toBe(true);
  });

  it("marks call as suppressed when preceded by block comment /* console-log-janitor-ignore */", () => {
    const code = `
/* console-log-janitor-ignore */
console.log("suppressed with block comment");
`;
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(1);
    expect(matches[0].isSuppressed).toBe(true);
  });

  it("only suppresses the designated call and detects subsequent unsuppressed calls", () => {
    const code = `
// console-log-janitor-ignore
console.log("suppressed call");

console.log("unsuppressed call");
`;
    const detector = new Detector(code);
    const matches = detector.detect();

    expect(matches).toHaveLength(2);
    expect(matches[0].isSuppressed).toBe(true);
    expect(matches[1].isSuppressed).toBe(false);
  });
});
