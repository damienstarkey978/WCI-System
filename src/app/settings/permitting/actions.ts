"use server";

import { revalidatePath } from "next/cache";

import {
  CityPortalKind,
  DesignProfessionalKind,
  PackagePermitType,
  UserRole,
} from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import {
  PermitSettingsError,
  connectCityPortalCredential,
  createContractorLicense,
  createDesignProfessional,
  createFormSetTemplate,
  createPaisProductTemplate,
  deleteContractorLicense,
  deleteDesignProfessional,
  deleteFormSetTemplate,
  deletePaisProductTemplate,
  disconnectCityPortalCredential,
  ensureDefaultWciContractorLicense,
  upsertNocPreset,
} from "@/lib/permitting/package-settings";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

function revalidate() {
  revalidatePath("/settings/permitting");
}

async function adminOrgId() {
  const admin = await requireRole(UserRole.ADMIN);
  return admin.organizationId;
}

export async function ensureDefaultLicenseAction(): Promise<ActionState> {
  try {
    const organizationId = await adminOrgId();
    await ensureDefaultWciContractorLicense(organizationId);
    revalidate();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function createLicenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const organizationId = await adminOrgId();
    const expiresRaw = String(formData.get("expiresAt") ?? "").trim();
    await createContractorLicense(organizationId, {
      companyName: String(formData.get("companyName") ?? ""),
      qualifierName: String(formData.get("qualifierName") ?? ""),
      licenseType: String(formData.get("licenseType") ?? ""),
      licenseNumber: String(formData.get("licenseNumber") ?? ""),
      expiresAt: expiresRaw ? new Date(`${expiresRaw}T12:00:00.000Z`) : null,
      active: formData.get("active") === "on",
      addressLine1: String(formData.get("addressLine1") ?? ""),
      city: String(formData.get("city") ?? ""),
      state: String(formData.get("state") ?? ""),
      postalCode: String(formData.get("postalCode") ?? ""),
      county: String(formData.get("county") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
    });
    revalidate();
    return { ok: true };
  } catch (error) {
    if (error instanceof PermitSettingsError) return { error: error.message };
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteLicenseAction(licenseId: string): Promise<ActionState> {
  try {
    const organizationId = await adminOrgId();
    await deleteContractorLicense(organizationId, licenseId);
    revalidate();
    return { ok: true };
  } catch (error) {
    if (error instanceof PermitSettingsError) return { error: error.message };
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function saveNocPresetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const organizationId = await adminOrgId();
    await upsertNocPreset(organizationId, {
      county: String(formData.get("county") ?? "DUVAL"),
      descriptionOfImprovement: String(formData.get("descriptionOfImprovement") ?? ""),
      ownersInterest: String(formData.get("ownersInterest") ?? ""),
      designatedPersonForNotices: String(formData.get("designatedPersonForNotices") ?? ""),
      lienorsNoticeRecipient: String(formData.get("lienorsNoticeRecipient") ?? ""),
      expirationRule: String(formData.get("expirationRule") ?? ""),
    });
    revalidate();
    return { ok: true };
  } catch (error) {
    if (error instanceof PermitSettingsError) return { error: error.message };
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function createDesignProAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const organizationId = await adminOrgId();
    const kindRaw = String(formData.get("kind") ?? "ENGINEER");
    const kind = Object.values(DesignProfessionalKind).includes(kindRaw as DesignProfessionalKind)
      ? (kindRaw as DesignProfessionalKind)
      : DesignProfessionalKind.ENGINEER;
    await createDesignProfessional(organizationId, {
      kind,
      name: String(formData.get("name") ?? ""),
      firm: String(formData.get("firm") ?? ""),
      licenseNumber: String(formData.get("licenseNumber") ?? ""),
      addressLine1: String(formData.get("addressLine1") ?? ""),
      city: String(formData.get("city") ?? ""),
      state: String(formData.get("state") ?? ""),
      postalCode: String(formData.get("postalCode") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
    });
    revalidate();
    return { ok: true };
  } catch (error) {
    if (error instanceof PermitSettingsError) return { error: error.message };
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteDesignProAction(id: string): Promise<ActionState> {
  try {
    const organizationId = await adminOrgId();
    await deleteDesignProfessional(organizationId, id);
    revalidate();
    return { ok: true };
  } catch (error) {
    if (error instanceof PermitSettingsError) return { error: error.message };
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function createFormSetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const organizationId = await adminOrgId();
    const formKeys = formData
      .getAll("formKeys")
      .map((v) => String(v))
      .filter(Boolean);
    const permitTypeRaw = String(formData.get("permitType") ?? "BUILDING");
    const permitType = Object.values(PackagePermitType).includes(permitTypeRaw as PackagePermitType)
      ? (permitTypeRaw as PackagePermitType)
      : PackagePermitType.BUILDING;
    await createFormSetTemplate(organizationId, {
      name: String(formData.get("name") ?? ""),
      county: String(formData.get("county") ?? "DUVAL"),
      municipality: String(formData.get("municipality") ?? ""),
      permitType,
      formKeys,
    });
    revalidate();
    return { ok: true };
  } catch (error) {
    if (error instanceof PermitSettingsError) return { error: error.message };
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteFormSetAction(id: string): Promise<ActionState> {
  try {
    const organizationId = await adminOrgId();
    await deleteFormSetTemplate(organizationId, id);
    revalidate();
    return { ok: true };
  } catch (error) {
    if (error instanceof PermitSettingsError) return { error: error.message };
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function createPaisTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const organizationId = await adminOrgId();
    await createPaisProductTemplate(organizationId, {
      name: String(formData.get("name") ?? ""),
      manufacturer: String(formData.get("manufacturer") ?? ""),
      model: String(formData.get("model") ?? ""),
      approvalNumber: String(formData.get("approvalNumber") ?? ""),
      category: String(formData.get("category") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });
    revalidate();
    return { ok: true };
  } catch (error) {
    if (error instanceof PermitSettingsError) return { error: error.message };
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deletePaisTemplateAction(id: string): Promise<ActionState> {
  try {
    const organizationId = await adminOrgId();
    await deletePaisProductTemplate(organizationId, id);
    revalidate();
    return { ok: true };
  } catch (error) {
    if (error instanceof PermitSettingsError) return { error: error.message };
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function connectEpicsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const organizationId = await adminOrgId();
    await connectCityPortalCredential(organizationId, {
      portal: CityPortalKind.JAX_EPICS,
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    revalidate();
    return { ok: true };
  } catch (error) {
    if (error instanceof PermitSettingsError) return { error: error.message };
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function disconnectEpicsAction(): Promise<ActionState> {
  try {
    const organizationId = await adminOrgId();
    await disconnectCityPortalCredential(organizationId, CityPortalKind.JAX_EPICS);
    revalidate();
    return { ok: true };
  } catch (error) {
    if (error instanceof PermitSettingsError) return { error: error.message };
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
