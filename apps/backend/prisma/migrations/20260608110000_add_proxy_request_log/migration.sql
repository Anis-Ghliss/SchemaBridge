CREATE TABLE "ProxyRequestLog" (
    "id" TEXT NOT NULL,
    "bindingId" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "upstreamUrl" TEXT,
    "transformedRequest" JSONB,
    "responseBody" JSONB,
    "errors" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProxyRequestLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProxyRequestLog_createdAt_idx" ON "ProxyRequestLog"("createdAt");

ALTER TABLE "ProxyRequestLog" ADD CONSTRAINT "ProxyRequestLog_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "ProxyBinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
