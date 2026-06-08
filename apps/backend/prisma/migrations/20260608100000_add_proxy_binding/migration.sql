CREATE TABLE "ProxyBinding" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "pathPattern" TEXT NOT NULL,
    "upstreamBaseUrl" TEXT NOT NULL,
    "mappingId" TEXT NOT NULL,
    "responseMappingId" TEXT,
    "forwardHeaders" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProxyBinding_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProxyBinding" ADD CONSTRAINT "ProxyBinding_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "Mapping"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProxyBinding" ADD CONSTRAINT "ProxyBinding_responseMappingId_fkey" FOREIGN KEY ("responseMappingId") REFERENCES "Mapping"("id") ON DELETE SET NULL ON UPDATE CASCADE;
