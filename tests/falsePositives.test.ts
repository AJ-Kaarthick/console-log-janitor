import { describe, it, expect } from "vitest";
import { Detector } from "../src/scanner/detector";

describe("Detector - False Positive Prevention", () => {
  it("does not flag console.log in single-line comment", () => {
    const code = '// console.log("this is a comment");';
    const detector = new Detector(code);
    expect(detector.detect()).toHaveLength(0);
  });

  it("does not flag console.log in inline trailing comment", () => {
    const code = 'const x = 1; // console.log(x);';
    const detector = new Detector(code);
    expect(detector.detect()).toHaveLength(0);
  });

  it("does not flag console.log in block comment", () => {
    const code = '/* console.log("this is block comment"); */';
    const detector = new Detector(code);
    expect(detector.detect()).toHaveLength(0);
  });

  it("does not flag console.log in multi-line block comment", () => {
    const code = `/**
 * Helper function
 * Example: console.log("hello");
 */
function help() {}`;
    const detector = new Detector(code);
    expect(detector.detect()).toHaveLength(0);
  });

  it("does not flag console.log in single-quoted string", () => {
    const code = "const message = 'console.log(\"fake\");';";
    const detector = new Detector(code);
    expect(detector.detect()).toHaveLength(0);
  });

  it("does not flag console.log in double-quoted string", () => {
    const code = 'const query = "SELECT * FROM logs WHERE type = \\"console.log\\"";';
    const detector = new Detector(code);
    expect(detector.detect()).toHaveLength(0);
  });

  it("does not flag console.log in static template string", () => {
    const code = "const doc = `Run console.log to debug issues`;";
    const detector = new Detector(code);
    expect(detector.detect()).toHaveLength(0);
  });

  it("does not flag variables with console.log in their name", () => {
    const code = `
const myConsoleLog = 1;
const consoleLog = 2;
const console_log = 3;
const isConsoleLogEnabled = true;
`;
    const detector = new Detector(code);
    expect(detector.detect()).toHaveLength(0);
  });

  it("does not flag identifier starting with console like consoleLogger", () => {
    const code = 'consoleLogger.info("some log");';
    const detector = new Detector(code);
    expect(detector.detect()).toHaveLength(0);
  });

  it("does not flag method ending in log like appLog", () => {
    const code = 'appLog("custom logger");';
    const detector = new Detector(code);
    expect(detector.detect()).toHaveLength(0);
  });

  it("does not flag object property receiver obj.console.log", () => {
    const code = 'customService.console.log("not global console");';
    const detector = new Detector(code);
    expect(detector.detect()).toHaveLength(0);
  });

  it("does not flag other console methods like console.error, warn, info", () => {
    const code = `
console.error("error message");
console.warn("warning message");
console.info("info message");
console.debug("debug message");
console.table(["a", "b"]);
`;
    const detector = new Detector(code);
    expect(detector.detect()).toHaveLength(0);
  });

  it("does not flag console.logger or console.login methods", () => {
    const code = `
console.logger("not log");
console.login("username");
console.logOther("something");
`;
    const detector = new Detector(code);
    expect(detector.detect()).toHaveLength(0);
  });

  it("does not flag console.log function reference without call", () => {
    const code = "const logFn = console.log;";
    const detector = new Detector(code);
    expect(detector.detect()).toHaveLength(0);
  });

  it("does not flag regex containing console.log pattern", () => {
    const code = "const regex = /console\\.log\\(.*\\)/g;";
    const detector = new Detector(code);
    expect(detector.detect()).toHaveLength(0);
  });

  it("does not flag console.log in JSX text child", () => {
    const code = `function App() {
  return <div>console.log("plain text in tag")</div>;
}`;
    const detector = new Detector(code);
    expect(detector.detect()).toHaveLength(0);
  });
});
