CREATE TABLE "ProxyApp" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "bindingIds" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProxyApp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProxyApp_name_key" ON "ProxyApp"("name");
CREATE UNIQUE INDEX "ProxyApp_keyHash_key" ON "ProxyApp"("keyHash");
CREATE INDEX "ProxyApp_keyHash_idx" ON "ProxyApp"("keyHash");

ALTER TABLE "ProxyRequestLog" ADD COLUMN "appId" TEXT;
ALTER TABLE "ProxyRequestLog" ADD CONSTRAINT "ProxyRequestLog_appId_fkey" FOREIGN KEY ("appId") REFERENCES "ProxyApp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
