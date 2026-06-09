# Release Checklist

Use this checklist before publishing a new OSS release.

## Code

```bash
npm install
npm run lint
npm run test
npm run build
```

For frontend changes, also run React Doctor:

```bash
npx -y react-doctor@latest . --verbose --diff
```

## Docker Smoke Test

Start from a blank database:

```bash
docker compose down -v
docker compose up --build
```

Verify:

- admin UI loads at <http://localhost:4000>
- health endpoint returns `schema-bridge-api`
- no sample schemas, mappings, bindings, or apps exist
- a source schema can be created
- a target schema can be created
- a mapping can be created manually
- a binding can be created
- Try it shows the transformed request
- strict validation blocks bad input before upstream forwarding
- a valid request reaches the receiver
- Live traffic records the incoming and transformed payloads

## Version

Update every workspace package and internal workspace dependency to the same version.

```bash
npm install --package-lock-only --ignore-scripts
git diff --check
```

Update:

- `CHANGELOG.md`
- README image examples
- any docs that mention the latest version

## Publish

Create the release commit and tag:

```bash
git add .
git commit -m "Release vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main --follow-tags
```

After GitHub Actions finishes, users should be able to pull:

```bash
docker pull ghcr.io/anis-ghliss/schemabridge:vX.Y.Z
```

