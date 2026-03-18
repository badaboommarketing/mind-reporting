import { createHash } from "node:crypto";

import { IdentityLink } from "./model.js";

export interface IdentityCandidate {
  email?: string | null;
  phone?: string | null;
  explicitContactKey?: string | null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

export function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildIdentityHashes(candidate: IdentityCandidate): {
  normalizedEmailHash?: string;
  normalizedPhoneHash?: string;
} {
  return {
    normalizedEmailHash: candidate.email ? hashValue(normalizeEmail(candidate.email)) : undefined,
    normalizedPhoneHash: candidate.phone ? hashValue(normalizePhone(candidate.phone)) : undefined,
  };
}

export function resolveIdentityLink(
  links: IdentityLink[],
  candidate: IdentityCandidate,
): IdentityLink | null {
  if (candidate.explicitContactKey) {
    const explicitMatch = links.find((link) => link.contactKey === candidate.explicitContactKey);
    if (explicitMatch) {
      return explicitMatch;
    }
  }

  const hashes = buildIdentityHashes(candidate);

  if (hashes.normalizedEmailHash) {
    const emailMatches = links.filter(
      (link) => link.normalizedEmailHash === hashes.normalizedEmailHash,
    );
    if (emailMatches.length === 1) {
      return emailMatches[0] ?? null;
    }
    if (emailMatches.length > 1) {
      return null;
    }
  }

  if (hashes.normalizedPhoneHash) {
    const phoneMatches = links.filter(
      (link) => link.normalizedPhoneHash === hashes.normalizedPhoneHash,
    );
    if (phoneMatches.length === 1) {
      return phoneMatches[0] ?? null;
    }
  }

  return null;
}
