import { describe, expect, it } from "vitest";

import { parseCsv } from "@/lib/directory/csv";

describe("parseCsv", () => {
  it("splits plain rows and handles CRLF", () => {
    expect(parseCsv("a,b,c\r\n1,2,3\r\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps commas, newlines and escaped quotes inside quoted fields", () => {
    expect(parseCsv('name,notes\n"Acme, Inc.","line one,\nline two"\n"Say ""hi""",x')).toEqual([
      ["name", "notes"],
      ["Acme, Inc.", "line one,\nline two"],
      ['Say "hi"', "x"],
    ]);
  });

  it("strips a leading BOM and keeps a final row with no trailing newline", () => {
    expect(parseCsv("﻿a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("preserves empty fields", () => {
    expect(parseCsv("a,,c\n,,")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });
});
