import "server-only";
import { db } from "@/lib/db";
import { COMPANY_PROFILE_KEY, companyCompliance, parseCompanyProfile, type CompanyProfile } from "./shared";

/** The company profile stored as JSON in AppSetting "company.profile" (empty fields when unset). */
export async function getCompanyProfile(): Promise<CompanyProfile> {
  const row = await db.appSetting.findUnique({ where: { key: COMPANY_PROFILE_KEY } });
  return parseCompanyProfile(row?.value);
}

/** Profile plus when it was last saved (null until the first save). */
export async function getCompanyProfileRecord(): Promise<{ profile: CompanyProfile; updatedAt: Date | null }> {
  const row = await db.appSetting.findUnique({ where: { key: COMPANY_PROFILE_KEY } });
  return { profile: parseCompanyProfile(row?.value), updatedAt: row?.updatedAt ?? null };
}

/** Compliance status of the required company documents (licence, insurance, tax certificate). */
export async function getCompanyCompliance() {
  const docs = await db.document.findMany({
    where: { isCompany: true },
    select: { id: true, kind: true, name: true, expiresAt: true, createdAt: true },
  });
  return companyCompliance(docs);
}
