CREATE TABLE "SchemaDocument" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "fields" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchemaDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Mapping" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceSchemaId" TEXT NOT NULL,
    "targetSchemaId" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Mapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MappingVersion" (
    "id" TEXT NOT NULL,
    "mappingId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MappingVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MappingVersion_mappingId_version_key" ON "MappingVersion"("mappingId", "version");

ALTER TABLE "Mapping" ADD CONSTRAINT "Mapping_sourceSchemaId_fkey" FOREIGN KEY ("sourceSchemaId") REFERENCES "SchemaDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Mapping" ADD CONSTRAINT "Mapping_targetSchemaId_fkey" FOREIGN KEY ("targetSchemaId") REFERENCES "SchemaDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MappingVersion" ADD CONSTRAINT "MappingVersion_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "Mapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;
