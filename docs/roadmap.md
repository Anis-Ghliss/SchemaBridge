# Future Roadmap

## AI-Assisted Field Mapping

Use embeddings and LLM reasoning to suggest candidate mappings from field names, sample values, descriptions, and historical mappings. Add confidence scores and require human approval before saving.

## GraphQL Support

Ingest GraphQL schemas and convert types into the same internal field tree model. Support mapping between REST JSON payloads and GraphQL input/output shapes.

## OpenAPI Ingestion

Parse OpenAPI documents, extract request and response schemas, and generate versioned schema documents automatically.

## Schema Drift Detection

Continuously compare observed production payloads against registered schemas. Alert when fields appear, disappear, or change type.

## Git Integration

Store mapping definitions as versioned JSON files in repositories. Add pull request checks for breaking schema changes and mapping coverage.

## RBAC

Introduce organizations, projects, roles, and permissions. Restrict schema publishing, version restore, and production deployment to approved roles.

## Multi-Tenant SaaS Architecture

Add tenant-scoped data models, auth middleware, audit logs, billing integration, per-tenant rate limits, and isolated background workers for transformation validation.
