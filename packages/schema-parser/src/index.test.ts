import { describe, expect, it } from "vitest";
import { parseJsonText, parseSchema } from "./index";

describe("schema parser", () => {
  it("parses nested objects and arrays into fields", () => {
    const result = parseSchema({ customer: { name: "John", tags: ["vip"] } });

    expect(result.fields[0]?.path).toBe("customer");
    expect(result.fields[0]?.children.map((field) => field.path)).toEqual(["customer.name", "customer.tags"]);
    expect(result.fields[0]?.children[1]?.children[0]?.path).toBe("customer.tags[]");
  });

  it("returns JSON parse errors", () => {
    expect(parseJsonText("{").error).toContain("JSON");
  });
});
