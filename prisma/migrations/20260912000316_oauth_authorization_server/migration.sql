-- AlterTable
ALTER TABLE "OAuthClient" ADD COLUMN     "clientUri" TEXT,
ADD COLUMN     "logoUri" TEXT,
ADD COLUMN     "redirectUris" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "selfRegistered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tokenEndpointAuthMethod" TEXT NOT NULL DEFAULT 'client_secret_post',
ALTER COLUMN "organizationId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "OAuthAuthorizationCode" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "hashedSecret" TEXT NOT NULL,
    "oauthClientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scopes" TEXT[],
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "codeChallengeMethod" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAuthorizationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAccessToken" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "hashedSecret" TEXT NOT NULL,
    "oauthClientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthRefreshToken" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "hashedSecret" TEXT NOT NULL,
    "oauthClientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "rotatedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAuthorizationCode_tokenId_key" ON "OAuthAuthorizationCode"("tokenId");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_oauthClientId_idx" ON "OAuthAuthorizationCode"("oauthClientId");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_expiresAt_idx" ON "OAuthAuthorizationCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccessToken_tokenId_key" ON "OAuthAccessToken"("tokenId");

-- CreateIndex
CREATE INDEX "OAuthAccessToken_oauthClientId_idx" ON "OAuthAccessToken"("oauthClientId");

-- CreateIndex
CREATE INDEX "OAuthAccessToken_userId_idx" ON "OAuthAccessToken"("userId");

-- CreateIndex
CREATE INDEX "OAuthAccessToken_expiresAt_idx" ON "OAuthAccessToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthRefreshToken_tokenId_key" ON "OAuthRefreshToken"("tokenId");

-- CreateIndex
CREATE INDEX "OAuthRefreshToken_oauthClientId_idx" ON "OAuthRefreshToken"("oauthClientId");

-- CreateIndex
CREATE INDEX "OAuthRefreshToken_userId_idx" ON "OAuthRefreshToken"("userId");

-- AddForeignKey
ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_oauthClientId_fkey" FOREIGN KEY ("oauthClientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAccessToken" ADD CONSTRAINT "OAuthAccessToken_oauthClientId_fkey" FOREIGN KEY ("oauthClientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAccessToken" ADD CONSTRAINT "OAuthAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAccessToken" ADD CONSTRAINT "OAuthAccessToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthRefreshToken" ADD CONSTRAINT "OAuthRefreshToken_oauthClientId_fkey" FOREIGN KEY ("oauthClientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthRefreshToken" ADD CONSTRAINT "OAuthRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthRefreshToken" ADD CONSTRAINT "OAuthRefreshToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
