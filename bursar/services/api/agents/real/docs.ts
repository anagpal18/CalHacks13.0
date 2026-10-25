// The vendor's documents as text, the way a scan of them reads, for DOC_ANALYST. A built-in document always renders
// the same text, so its analysis can be cached; the judge's W-9 renders from the fields the judge handed in.

import type { UploadedW9 } from "@terms-room/shared";
import type { ScenarioCase } from "../../negotiation/scenarios.ts";

export type DocKind = "w9" | "license" | "reference" | "invoices" | "bank_letter";

/** The CRS business products a document claim can be checked against, with the fields Bursar reads from each. */
export const BUSINESS_PRODUCTS: { product: string; fields: string[] }[] = [
  { product: "biz_registration", fields: ["results.businessHeader.businessName", "results.corporateRegistration.incorporatedDate",
    "results.corporateRegistration.statusDescription", "results.corporateRegistration.businessType", "results.corporateRegistration.officers[0].name"] },
  { product: "biz_fraud_shields", fields: ["results.fraudShields.taxIdMatchIndicator", "results.fraudShields.addressMatchIndicator",
    "results.fraudShields.activeBusinessIndicator", "results.fraudShields.ofacMatchWarning"] },
  { product: "biz_quick_search", fields: ["results[0].businessName", "results[0].yearOfIncorporation", "lookAlikeIndicator"] },
  { product: "biz_risk_dashboard", fields: ["results.paymentPerformance.currentDbt", "results.intelliscore.score",
    "results.creditLimitRecommendation.recommendedCreditLimitAmount"] },
];

export function w9Text(w: UploadedW9): string {
  const [street, ...rest] = w.address.split(", ");
  const corp = /\b(INC|CORP|CORPORATION|CO)\b\.?$/i.test(w.legalName.trim());
  return [
    "Form W-9 (Rev. March 2024)",
    "Request for Taxpayer Identification Number and Certification",
    "1 Name of entity/individual. An entry is required.",
    w.legalName,
    "2 Business name/disregarded entity name, if different from above.",
    "",
    "3a Federal tax classification of the entity/individual whose name is entered on line 1.",
    corp ? "[X] C corporation" : "[X] LLC. Tax classification (C = C corporation, S = S corporation, P = Partnership): P",
    "5 Address (number, street, and apt. or suite no.)",
    street ?? "",
    "6 City, state, and ZIP code",
    rest.join(", "),
    "Part I Taxpayer Identification Number (TIN)",
    "Social security number  ___ - __ - ____",
    "or",
    `Employer identification number  ${w.ein}`,
    "Part II Certification",
    "Under penalties of perjury, I certify that the number shown on this form is my correct taxpayer identification number.",
    `Sign Here  Signature of U.S. person: ${w.signer}`,
  ].join("\n");
}

export function documentText(kind: Exclude<DocKind, "w9">, sc: ScenarioCase): string {
  const d = sc.docs, b = sc.sub.business;
  switch (kind) {
    case "license":
      return ["BUSINESS LICENSE", `Licensee: ${b}`, `Trade: ${sc.sub.trade}`, `Licensed and in business since: ${d.licenseSince}`, "Status: Active"].join("\n");
    case "reference":
      return [d.reference.from, "Letter of reference", "To whom it may concern:", `${b} ${d.reference.claim}.`, `Accounts receivable, ${d.reference.from}`].join("\n");
    case "invoices":
      return ["Summary of past invoices", `${d.invoices}.`].join("\n");
    case "bank_letter":
      return ["Letter from the vendor's bank", `${d.bank}.`].join("\n");
  }
}
