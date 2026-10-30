-- Bind OAuth grants to an org ApiKey so MCP writes attribute as heather/atlas/roy
-- instead of the OAuth client display name ("Cursor"). Stored on the grant (not the
-- shared OAuthClient) because self-registered clients are multi-tenant.

ALTER TABLE "OAuthAuthorizationCode" ADD COLUMN "actingApiKeyId" TEXT;
ALTER TABLE "OAuthAccessToken" ADD COLUMN "actingApiKeyId" TEXT;
ALTER TABLE "OAuthRefreshToken" ADD COLUMN "actingApiKeyId" TEXT;

CREATE INDEX "OAuthAuthorizationCode_actingApiKeyId_idx" ON "OAuthAuthorizationCode"("actingApiKeyId");
CREATE INDEX "OAuthAccessToken_actingApiKeyId_idx" ON "OAuthAccessToken"("actingApiKeyId");
CREATE INDEX "OAuthRefreshToken_actingApiKeyId_idx" ON "OAuthRefreshToken"("actingApiKeyId");

ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_actingApiKeyId_fkey" FOREIGN KEY ("actingApiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OAuthAccessToken" ADD CONSTRAINT "OAuthAccessToken_actingApiKeyId_fkey" FOREIGN KEY ("actingApiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OAuthRefreshToken" ADD CONSTRAINT "OAuthRefreshToken_actingApiKeyId_fkey" FOREIGN KEY ("actingApiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
