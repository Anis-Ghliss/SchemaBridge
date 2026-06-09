import { describe, expect, it } from "vitest";
import { checkEgress, defaultEgressPolicy, type EgressPolicy } from "./egressGuard";

const permissive = defaultEgressPolicy();
const strict: EgressPolicy = { ...permissive, allowPrivate: false };

describe("egress guard", () => {
  it("allows ordinary public https upstreams", async () => {
    expect(await checkEgress("https://api.example.com/v1", permissive)).toEqual({ ok: true });
  });

  it("allows private and loopback upstreams under the default policy", async () => {
    expect((await checkEgress("http://service-b:8080", permissive)).ok).toBe(true);
    expect((await checkEgress("http://127.0.0.1:9", permissive)).ok).toBe(true);
    expect((await checkEgress("http://10.1.2.3/path", permissive)).ok).toBe(true);
  });

  it("always blocks cloud-metadata / link-local addresses, even when private is allowed", async () => {
    const verdict = await checkEgress("http://169.254.169.254/latest/meta-data/", permissive);
    expect(verdict.ok).toBe(false);
  });

  it("blocks the IPv4-mapped metadata address", async () => {
    const verdict = await checkEgress("http://[::ffff:169.254.169.254]/", permissive);
    expect(verdict.ok).toBe(false);
  });

  it("blocks non-http schemes", async () => {
    expect((await checkEgress("file:///etc/passwd", permissive)).ok).toBe(false);
    expect((await checkEgress("gopher://internal/", permissive)).ok).toBe(false);
  });

  it("blocks the unspecified address", async () => {
    expect((await checkEgress("http://0.0.0.0/", permissive)).ok).toBe(false);
  });

  it("rejects malformed URLs", async () => {
    expect((await checkEgress("not a url", permissive)).ok).toBe(false);
  });

  it("blocks loopback and private literals under a strict policy", async () => {
    expect((await checkEgress("http://127.0.0.1:9", strict)).ok).toBe(false);
    expect((await checkEgress("http://192.168.0.5", strict)).ok).toBe(false);
    expect((await checkEgress("http://[::1]/", strict)).ok).toBe(false);
  });

  it("enforces an explicit host allowlist", async () => {
    const allow: EgressPolicy = { ...permissive, allowedHosts: new Set(["receiver.local"]) };
    expect((await checkEgress("http://receiver.local/orders", allow)).ok).toBe(true);
    expect((await checkEgress("http://other.local/orders", allow)).ok).toBe(false);
  });
});
