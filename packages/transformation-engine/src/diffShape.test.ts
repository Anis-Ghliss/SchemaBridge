import { describe, expect, it } from "vitest";
import { diffShape } from "./index";

describe("diffShape (contract drift)", () => {
  it("reports no drift when the payload matches the contract", () => {
    const example = { id: "x", profile: { name: "Ada", age: 36 }, tags: ["a"] };
    const observed = { id: "y", profile: { name: "Grace", age: 40 }, tags: ["b", "c"] };
    expect(diffShape(observed, example)).toEqual([]);
  });

  it("detects an added top-level field (upstream introduced a key)", () => {
    const example = { id: "x" };
    const observed = { id: "y", newFlag: true };
    expect(diffShape(observed, example)).toEqual([{ kind: "added", path: "newFlag", observedType: "boolean" }]);
  });

  it("detects a missing contracted field", () => {
    const example = { id: "x", email: "a@b.c" };
    const observed = { id: "y" };
    expect(diffShape(observed, example)).toEqual([{ kind: "missing", path: "email", expectedType: "string" }]);
  });

  it("detects a leaf type change", () => {
    const example = { total: 12.5 };
    const observed = { total: "12.5" };
    expect(diffShape(observed, example)).toEqual([
      { kind: "type-changed", path: "total", expectedType: "number", observedType: "string" }
    ]);
  });

  it("detects drift nested inside objects", () => {
    const example = { customer: { name: "Ada", email: "a@b.c" } };
    const observed = { customer: { name: "Ada", phone: "555" } };
    expect(diffShape(observed, example)).toEqual([
      { kind: "missing", path: "customer.email", expectedType: "string" },
      { kind: "added", path: "customer.phone", observedType: "string" }
    ]);
  });

  it("collapses array-element drift to a [] wildcard and de-duplicates across items", () => {
    const example = { items: [{ sku: "A", qty: 1 }] };
    const observed = { items: [
      { sku: "A", qty: 1, discount: 0.1 },
      { sku: "B", qty: 2, discount: 0.2 }
    ] };
    expect(diffShape(observed, example)).toEqual([
      { kind: "added", path: "items[].discount", observedType: "number" }
    ]);
  });

  it("reports a container becoming the wrong type", () => {
    const example = { meta: { a: 1 } };
    const observed = { meta: "oops" };
    expect(diffShape(observed, example)).toEqual([
      { kind: "type-changed", path: "meta", expectedType: "object", observedType: "string" }
    ]);
  });

  it("reports an expected array arriving as a non-array", () => {
    const example = { tags: ["a"] };
    const observed = { tags: 5 };
    expect(diffShape(observed, example)).toEqual([
      { kind: "type-changed", path: "tags", expectedType: "array", observedType: "number" }
    ]);
  });

  it("distinguishes null from other types", () => {
    const example = { note: "hi" };
    const observed = { note: null };
    expect(diffShape(observed, example)).toEqual([
      { kind: "type-changed", path: "note", expectedType: "string", observedType: "null" }
    ]);
  });

  it("surfaces both an added and a missing field together", () => {
    const example = { a: 1, b: 2 };
    const observed = { a: 1, c: 3 };
    expect(diffShape(observed, example)).toEqual([
      { kind: "missing", path: "b", expectedType: "number" },
      { kind: "added", path: "c", observedType: "number" }
    ]);
  });
});
