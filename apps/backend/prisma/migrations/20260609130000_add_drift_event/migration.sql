CREATE TABLE "DriftEvent" (
    "id" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "expectedType" TEXT,
    "observedType" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriftEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DriftEvent_bindingId_stage_kind_path_key" ON "DriftEvent"("bindingId", "stage", "kind", "path");
CREATE INDEX "DriftEvent_bindingId_idx" ON "DriftEvent"("bindingId");
CREATE INDEX "DriftEvent_lastSeenAt_idx" ON "DriftEvent"("lastSeenAt");

ALTER TABLE "DriftEvent" ADD CONSTRAINT "DriftEvent_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "ProxyBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
