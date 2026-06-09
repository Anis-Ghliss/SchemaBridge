export interface StartupSecurityConfig {
  readonly nodeEnv: string | undefined;
  readonly requireAuth: boolean;
  readonly adminApiKey: string | undefined;
  /** Escape hatch: deliberately allow an unauthenticated production boot. */
  readonly allowInsecure: boolean;
}

export interface StartupSecurityVerdict {
  /** Misconfigurations that must stop a production boot. */
  readonly fatal: readonly string[];
  /** Advisory messages that are always surfaced but never block boot. */
  readonly warnings: readonly string[];
}

const PROXY_OPEN =
  "PROXY_REQUIRE_AUTH is not set to true. The proxy port is open to anyone who can reach it. " +
  "Set PROXY_REQUIRE_AUTH=true and register apps in the Apps tab before exposing this bridge.";
const ADMIN_OPEN =
  "ADMIN_API_KEY is unset. The admin API and GUI are open to anyone who can reach them. Set ADMIN_API_KEY before deploying.";

/**
 * Outside production this only advises. In production an unauthenticated bridge
 * is treated as a fatal misconfiguration so it cannot accidentally come up wide
 * open — unless the operator explicitly opts in with BRIDGE_ALLOW_INSECURE=true.
 */
export function evaluateStartupSecurity(config: StartupSecurityConfig): StartupSecurityVerdict {
  const issues: string[] = [];
  if (!config.requireAuth) issues.push(PROXY_OPEN);
  if (!config.adminApiKey) issues.push(ADMIN_OPEN);

  const isProduction = config.nodeEnv === "production";
  if (isProduction && !config.allowInsecure) {
    return { fatal: issues, warnings: [] };
  }
  return { fatal: [], warnings: issues };
}
