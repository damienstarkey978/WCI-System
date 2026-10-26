import { describe, expect, it } from "vitest";

import { customFieldValueOf, parseCustomFieldValues } from "./job-custom-fields";

describe("job custom fields", () => {
  it("reads values by cf_ key and ignores junk", () => {
    expect(customFieldValueOf({ cf_a: "x", cf_b: true, jobType: "Remodel" }, "a")).toBe("x");
    expect(customFieldValueOf({ cf_b: true }, "b")).toBe(true);
    expect(customFieldValueOf({ cf_a: 5 }, "a")).toBeNull();
    expect(customFieldValueOf([], "a")).toBeNull();
    expect(customFieldValueOf(null, "a")).toBeNull();
  });

  it("treats a present checkbox as true and an absent one as false, and trims text", () => {
    const form = new Map<string, FormDataEntryValue>([
      ["cf_t", "  hello "],
      ["cf_c", "on"],
    ]);
    const values = parseCustomFieldValues(
      [
        { id: "t", type: "TEXT" },
        { id: "c", type: "CHECKBOX" },
        { id: "c2", type: "CHECKBOX" },
        { id: "t2", type: "TEXT" },
      ],
      (key) => form.get(key) ?? null,
    );
    expect(values).toEqual({ t: "hello", c: true, c2: false, t2: "" });
  });
});
