-- Permit Rockstar–style packages: org settings + package aggregate (batch 1).

CREATE TYPE "PackagePermitType" AS ENUM ('BUILDING', 'ELECTRICAL', 'FIRE', 'MECHANICAL', 'PLUMBING', 'ROOFING', 'OTHER');
CREATE TYPE "PermitPackageStatus" AS ENUM ('ACTIVE', 'SENT_TO_CONTRACTORS', 'ARCHIVED');
CREATE TYPE "PermitPackageFormStatus" AS ENUM ('DRAFT', 'CREATED', 'NOTARIZED', 'RECORDED', 'DOWNLOADED');
CREATE TYPE "DesignProfessionalKind" AS ENUM ('ARCHITECT', 'ENGINEER', 'OTHER');
CREATE TYPE "CityPortalKind" AS ENUM ('JAX_EPICS', 'DUVAL_CLERK');

CREATE TABLE "ContractorLicense" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "qualifierName" TEXT NOT NULL,
    "licenseType" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "county" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContractorLicense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NocPreset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "descriptionOfImprovement" TEXT,
    "ownersInterest" TEXT,
    "designatedPersonForNotices" TEXT,
    "lienorsNoticeRecipient" TEXT,
    "expirationRule" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NocPreset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DesignProfessional" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "DesignProfessionalKind" NOT NULL DEFAULT 'ENGINEER',
    "name" TEXT NOT NULL,
    "firm" TEXT,
    "licenseNumber" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DesignProfessional_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PermitFormSetTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "municipality" TEXT,
    "permitType" "PackagePermitType" NOT NULL,
    "formKeys" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PermitFormSetTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaisProductTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "approvalNumber" TEXT,
    "category" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaisProductTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CityPortalCredential" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "portal" "CityPortalKind" NOT NULL,
    "username" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CityPortalCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PermitPackage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobPermitId" TEXT,
    "name" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "municipality" TEXT,
    "permitType" "PackagePermitType" NOT NULL DEFAULT 'BUILDING',
    "propertyAddress" TEXT,
    "status" "PermitPackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "contractorLicenseId" TEXT,
    "designProfessionalId" TEXT,
    "automateWithCity" BOOLEAN NOT NULL DEFAULT false,
    "nocCreatedAt" TIMESTAMP(3),
    "packageCreatedAt" TIMESTAMP(3),
    "notarizedAt" TIMESTAMP(3),
    "recordedAt" TIMESTAMP(3),
    "initiatedAt" TIMESTAMP(3),
    "fieldValues" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PermitPackage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PermitPackageForm" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "formKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "PermitPackageFormStatus" NOT NULL DEFAULT 'DRAFT',
    "fieldValues" JSONB NOT NULL DEFAULT '{}',
    "pdfFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PermitPackageForm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PermitPackageProduct" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "templateId" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "approvalNumber" TEXT,
    "category" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PermitPackageProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContractorLicense_organizationId_licenseNumber_key" ON "ContractorLicense"("organizationId", "licenseNumber");
CREATE INDEX "ContractorLicense_organizationId_idx" ON "ContractorLicense"("organizationId");

CREATE UNIQUE INDEX "NocPreset_organizationId_county_key" ON "NocPreset"("organizationId", "county");
CREATE INDEX "NocPreset_organizationId_idx" ON "NocPreset"("organizationId");

CREATE INDEX "DesignProfessional_organizationId_idx" ON "DesignProfessional"("organizationId");

CREATE UNIQUE INDEX "PermitFormSetTemplate_organizationId_name_county_permitType_key" ON "PermitFormSetTemplate"("organizationId", "name", "county", "permitType");
CREATE INDEX "PermitFormSetTemplate_organizationId_idx" ON "PermitFormSetTemplate"("organizationId");

CREATE INDEX "PaisProductTemplate_organizationId_idx" ON "PaisProductTemplate"("organizationId");

CREATE UNIQUE INDEX "CityPortalCredential_organizationId_portal_key" ON "CityPortalCredential"("organizationId", "portal");

CREATE INDEX "PermitPackage_organizationId_idx" ON "PermitPackage"("organizationId");
CREATE INDEX "PermitPackage_jobId_status_idx" ON "PermitPackage"("jobId", "status");
CREATE INDEX "PermitPackage_jobPermitId_idx" ON "PermitPackage"("jobPermitId");

CREATE INDEX "PermitPackageForm_packageId_idx" ON "PermitPackageForm"("packageId");
CREATE UNIQUE INDEX "PermitPackageForm_packageId_formKey_key" ON "PermitPackageForm"("packageId", "formKey");

CREATE INDEX "PermitPackageProduct_packageId_idx" ON "PermitPackageProduct"("packageId");

ALTER TABLE "ContractorLicense" ADD CONSTRAINT "ContractorLicense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NocPreset" ADD CONSTRAINT "NocPreset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DesignProfessional" ADD CONSTRAINT "DesignProfessional_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PermitFormSetTemplate" ADD CONSTRAINT "PermitFormSetTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaisProductTemplate" ADD CONSTRAINT "PaisProductTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CityPortalCredential" ADD CONSTRAINT "CityPortalCredential_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PermitPackage" ADD CONSTRAINT "PermitPackage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PermitPackage" ADD CONSTRAINT "PermitPackage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PermitPackage" ADD CONSTRAINT "PermitPackage_jobPermitId_fkey" FOREIGN KEY ("jobPermitId") REFERENCES "JobPermit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PermitPackage" ADD CONSTRAINT "PermitPackage_contractorLicenseId_fkey" FOREIGN KEY ("contractorLicenseId") REFERENCES "ContractorLicense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PermitPackage" ADD CONSTRAINT "PermitPackage_designProfessionalId_fkey" FOREIGN KEY ("designProfessionalId") REFERENCES "DesignProfessional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PermitPackageForm" ADD CONSTRAINT "PermitPackageForm_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "PermitPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PermitPackageProduct" ADD CONSTRAINT "PermitPackageProduct_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "PermitPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PermitPackageProduct" ADD CONSTRAINT "PermitPackageProduct_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PaisProductTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
