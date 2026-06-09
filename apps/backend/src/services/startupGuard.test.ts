import { describe, expect, it } from "vitest";
import { evaluateStartupSecurity } from "./startupGuard";

describe("startup security guard", () => {
  it("only advises (never blocks) outside production", () => {
    const verdict = evaluateStartupSecurity({ nodeEnv: undefined, requireAuth: false, adminApiKey: undefined, allowInsecure: false });
    expect(verdict.fatal).toHaveLength(0);
    expect(verdict.warnings).toHaveLength(2);
  });

  it("blocks an unauthenticated production boot", () => {
    const verdict = evaluateStartupSecurity({ nodeEnv: "production", requireAuth: false, adminApiKey: undefined, allowInsecure: false });
    expect(verdict.fatal).toHaveLength(2);
    expect(verdict.warnings).toHaveLength(0);
  });

  it("flags only the missing control in production", () => {
    const verdict = evaluateStartupSecurity({ nodeEnv: "production", requireAuth: true, adminApiKey: undefined, allowInsecure: false });
    expect(verdict.fatal).toHaveLength(1);
    expect(verdict.fatal[0]).toContain("ADMIN_API_KEY");
  });

  it("passes cleanly when production auth is fully configured", () => {
    const verdict = evaluateStartupSecurity({ nodeEnv: "production", requireAuth: true, adminApiKey: "secret", allowInsecure: false });
    expect(verdict.fatal).toHaveLength(0);
    expect(verdict.warnings).toHaveLength(0);
  });

  it("downgrades fatal to warning when the insecure override is set", () => {
    const verdict = evaluateStartupSecurity({ nodeEnv: "production", requireAuth: false, adminApiKey: undefined, allowInsecure: true });
    expect(verdict.fatal).toHaveLength(0);
    expect(verdict.warnings).toHaveLength(2);
  });
});
