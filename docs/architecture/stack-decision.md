# Stack Decision

## Decision

SchemaBridge uses:

- Frontend: React, TypeScript, Vite, React Flow, Zustand, Tailwind CSS, shadcn-style UI primitives
- Backend: Node.js, TypeScript, Fastify
- Database: PostgreSQL with Prisma
- Validation: Zod contracts shared through `packages/shared-types`

## Options Compared

| Criterion | Node.js + TypeScript + Fastify | Go + Gin |
| --- | --- | --- |
| Development speed | Fastest for this MVP because frontend and backend share language, tooling, and schema contracts. | Fast, but requires separate DTO/model definitions and more glue. |
| Maintainability | Strong when contracts are centralized with Zod and package boundaries are enforced. | Strong for services, but less ergonomic for shared frontend validation. |
| Ecosystem | Excellent for Prisma, Zod, Vite, React, test tooling, and JSON-heavy workflows. | Excellent backend ecosystem, weaker direct alignment with React/Zod. |
| Scalability | Fastify is suitable for high-throughput APIs; horizontal scaling is straightforward. | Gin is highly performant and efficient. |
| Docker deployment | Simple Node images and workspace build. | Simple static binary deployment. |
| Hiring availability | TypeScript full-stack hiring pool is broad for SaaS MVP teams. | Go backend hiring is strong but narrower for full-stack MVP delivery. |
| MVP delivery speed | Best fit. One language, shared types, fewer integration surfaces. | Good, but slower for this product shape. |

## Rationale

The product is centered on JSON schemas, mappings, and validation contracts that must be reused by the UI and API. TypeScript + Fastify lets the MVP share Zod contracts and domain packages directly with the React frontend. That reduces duplicate validation, shortens the delivery loop, and keeps transformation logic portable.

Go + Gin remains a credible future option for specialized high-throughput transformation workers, but it is not the best first stack for a demoable SaaS MVP.

## Pragmatic Decisions

- Authentication is intentionally minimal for the MVP: a shared admin bearer token for the GUI/API and scoped app keys for the runtime proxy. Full users, roles, and audit trails can be added as Fastify plugins later.
- Mapping version comparison is a JSON diff-ready view for MVP speed. A semantic visual diff can be added later.
- React Flow stores edges as mapping rules and uses schema leaf paths as stable node IDs.
- The transformation engine is package-local and framework-neutral so it can later run in workers, CLIs, or edge functions.
