import { describe, expect, it } from "vitest";
import { transformPayload, validateAgainstExample, validateMappingRules } from "./index";

describe("transformation engine", () => {
  it("maps flat fields into nested fields", () => {
    const result = transformPayload(
      { customerName: "John", customerEmail: "john@example.com" },
      [
        { id: "1", sourcePath: "customerName", targetPath: "customer.name" },
        { id: "2", sourcePath: "customerEmail", targetPath: "customer.email" }
      ]
    );

    expect(result.status).toBe("success");
    expect(result.output).toEqual({ customer: { name: "John", email: "john@example.com" } });
  });

  it("uses default values for missing paths", () => {
    const result = transformPayload({}, [{ id: "1", sourcePath: "missing", targetPath: "status", defaultValue: "unknown" }]);

    expect(result.output).toEqual({ status: "unknown" });
  });

  it("can report missing source paths", () => {
    const result = transformPayload({}, [{ id: "1", sourcePath: "missing", targetPath: "status" }], { includeMissingErrors: true });

    expect(result.status).toBe("error");
    expect(result.errors).toEqual(["Missing source path: missing"]);
  });

  it("validates duplicate target mappings", () => {
    expect(
      validateMappingRules([
        { id: "1", sourcePath: "a", targetPath: "x" },
        { id: "2", sourcePath: "b", targetPath: "x" }
      ])
    ).toContain("Target path is mapped more than once: x");
  });

  it("rejects non-object input payloads", () => {
    const result = transformPayload("not an object", [{ id: "1", sourcePath: "a", targetPath: "b" }]);

    expect(result).toEqual({ status: "error", errors: ["Input payload must be a JSON object."] });
  });

  it("reads array indexes in source paths", () => {
    const result = transformPayload({ customers: [{ name: "Ada" }] }, [{ id: "1", sourcePath: "customers.0.name", targetPath: "primary.name" }]);

    expect(result.output).toEqual({ primary: { name: "Ada" } });
  });

  it("maps array item wildcard paths", () => {
    const result = transformPayload(
      { items: [{ sku: "BOOK-001", qty: 2, unit_price: 19.99 }] },
      [
        { id: "1", sourcePath: "items[].sku", targetPath: "lineItems[].sku" },
        { id: "2", sourcePath: "items[].qty", targetPath: "lineItems[].qty" },
        { id: "3", sourcePath: "items[].unit_price", targetPath: "lineItems[].unit_price" }
      ],
      { includeMissingErrors: true }
    );

    expect(result.status).toBe("success");
    expect(result.errors).toEqual([]);
    expect(result.output).toEqual({ lineItems: [{ sku: "BOOK-001", qty: 2, unit_price: 19.99 }] });
  });

  it("reports target path conflicts", () => {
    const result = transformPayload(
      { status: "active", city: "Tunis" },
      [
        { id: "1", sourcePath: "status", targetPath: "customer" },
        { id: "2", sourcePath: "city", targetPath: "customer.address.city" }
      ]
    );

    expect(result.status).toBe("error");
    expect(result.errors[0]).toContain("customer is not an object");
  });

  it("validates empty paths", () => {
    expect(validateMappingRules([{ id: "1", sourcePath: "", targetPath: "" }])).toEqual(["Rule 1 has an empty source path.", "Rule 1 has an empty target path."]);
  });

  it("coerces numeric strings to numbers", () => {
    const result = transformPayload({ amount: "42.5" }, [{ id: "1", sourcePath: "amount", targetPath: "total", transform: "number" }]);
    expect(result.output).toEqual({ total: 42.5 });
  });

  it("reports number coercion failures", () => {
    const result = transformPayload({ amount: "not-a-number" }, [{ id: "1", sourcePath: "amount", targetPath: "total", transform: "number" }]);
    expect(result.status).toBe("error");
    expect(result.errors[0]).toContain("not-a-number");
  });

  it("applies lowercase and uppercase transforms", () => {
    const result = transformPayload(
      { a: "HELLO", b: "World" },
      [
        { id: "1", sourcePath: "a", targetPath: "lower", transform: "lowercase" },
        { id: "2", sourcePath: "b", targetPath: "upper", transform: "uppercase" }
      ]
    );
    expect(result.output).toEqual({ lower: "hello", upper: "WORLD" });
  });

  it("normalizes dates to ISO format", () => {
    const result = transformPayload({ d: "2026-01-02" }, [{ id: "1", sourcePath: "d", targetPath: "createdAt", transform: "iso-date" }]);
    expect(result.status).toBe("success");
    expect(typeof result.output).toBe("object");
    const out = result.output as { createdAt: string };
    expect(out.createdAt.startsWith("2026-01-02")).toBe(true);
  });

  it("coerces boolean-like strings", () => {
    const result = transformPayload(
      { flag1: "yes", flag2: "0" },
      [
        { id: "1", sourcePath: "flag1", targetPath: "a", transform: "boolean" },
        { id: "2", sourcePath: "flag2", targetPath: "b", transform: "boolean" }
      ]
    );
    expect(result.output).toEqual({ a: true, b: false });
  });

  it("rejects non-coercible values for primitive transforms", () => {
    const result = transformPayload(
      { obj: { nested: true }, num: 0, list: [1] },
      [
        { id: "1", sourcePath: "obj", targetPath: "a", transform: "string" },
        { id: "2", sourcePath: "obj", targetPath: "b", transform: "number" },
        { id: "3", sourcePath: "obj", targetPath: "c", transform: "boolean" },
        { id: "4", sourcePath: "list", targetPath: "d", transform: "uppercase" }
      ]
    );
    expect(result.status).toBe("error");
    expect(result.errors.length).toBe(4);
  });

  it("coerces booleans into strings and numbers", () => {
    const result = transformPayload(
      { flag: true },
      [
        { id: "1", sourcePath: "flag", targetPath: "asString", transform: "string" },
        { id: "2", sourcePath: "flag", targetPath: "asNumber", transform: "number" }
      ]
    );
    expect(result.output).toEqual({ asString: "true", asNumber: 1 });
  });

  it("reports unparseable dates", () => {
    const result = transformPayload({ d: "not-a-date" }, [{ id: "1", sourcePath: "d", targetPath: "x", transform: "iso-date" }]);
    expect(result.status).toBe("error");
    expect(result.errors[0]).toContain("not-a-date");
  });

  it("validates payloads against example schemas", () => {
    expect(validateAgainstExample({ items: [{ sku: "BOOK-001" }] }, { items: [{ sku: "BOOK-001", qty: 1 }] }, "request-source")).toEqual([
      "request-source.items[0].qty is required"
    ]);
  });

  it("validates array, object, null, and primitive example mismatches", () => {
    expect(validateAgainstExample({ items: {} }, { items: [{ sku: "BOOK-001" }] }, "payload")).toEqual(["payload.items must be an array"]);
    expect(validateAgainstExample({ customer: [] }, { customer: { name: "Ada" } }, "payload")).toEqual(["payload.customer must be an object"]);
    expect(validateAgainstExample({ deletedAt: "never" }, { deletedAt: null }, "payload")).toEqual(["payload.deletedAt must be null"]);
    expect(validateAgainstExample({ total: "43.48" }, { total: 43.48 }, "payload")).toEqual(["payload.total must be number"]);
  });
});
