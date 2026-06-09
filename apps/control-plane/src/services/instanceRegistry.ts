export interface InstanceIdentity {
  readonly instanceId: string;
  readonly tenantId: string;
}

export interface InstanceRegistration extends InstanceIdentity {
  readonly token: string;
}

export interface TenantRegistration {
  readonly key: string;
  readonly tenantId: string;
}

/**
 * Resolves the bearer tokens presented to the control plane. Data-plane
 * instances present an instance token (bound to one instance + tenant); tenant
 * users present a tenant key (read access to their fleet). In-memory for now —
 * a production control plane backs this with a database of hashed credentials.
 */
export class InstanceRegistry {
  private readonly instancesByToken = new Map<string, InstanceIdentity>();
  private readonly tenantsByKey = new Map<string, string>();

  public constructor(instances: readonly InstanceRegistration[] = [], tenants: readonly TenantRegistration[] = []) {
    for (const instance of instances) {
      this.instancesByToken.set(instance.token, { instanceId: instance.instanceId, tenantId: instance.tenantId });
    }
    for (const tenant of tenants) {
      this.tenantsByKey.set(tenant.key, tenant.tenantId);
    }
  }

  public resolveInstance(token: string | undefined): InstanceIdentity | null {
    if (!token) return null;
    return this.instancesByToken.get(token) ?? null;
  }

  public resolveTenant(key: string | undefined): string | null {
    if (!key) return null;
    return this.tenantsByKey.get(key) ?? null;
  }
}
