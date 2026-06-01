/**
 * Read/write a string value at a dotted CvData path used by the inline editor
 * and diff overlay (e.g. "summary", "header.title", "skills.professional",
 * "experience[0].role", "experience[0].bullets[2]", "education[1].degree").
 *
 * PURE. Returns immutable copies so React state updates are safe. Skills paths
 * are edited as a single newline-joined block (one skill per line).
 */

import type { CvData, SectionKey } from "@/lib/schemas/cv-data";
import { DEFAULT_SECTION_TITLES } from "@/lib/schemas/cv-data";

const CONTACT_LABELS: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  location: "Location",
  linkedin: "LinkedIn",
};

export interface PathTarget {
  /** A human label for the editor header. */
  label: string;
  /** The current string value at the path. */
  value: string;
  /** Whether this field is multi-line (textarea vs input). */
  multiline: boolean;
  /** Skills are a list edited one-per-line. */
  isList: boolean;
}

export function readPath(data: CvData, path: string): PathTarget | null {
  if (path === "summary") {
    return { label: "Summary", value: data.summary, multiline: true, isList: false };
  }
  if (path === "header.title") {
    return { label: "Title", value: data.header.title, multiline: false, isList: false };
  }
  if (path === "header.name") {
    return { label: "Name", value: data.header.name, multiline: false, isList: false };
  }
  if (path === "header.website") {
    return { label: "Website", value: data.header.website ?? "", multiline: false, isList: false };
  }
  let m = path.match(/^contact\.(email|phone|location|linkedin)$/);
  if (m) {
    const key = m[1] as keyof CvData["contact"];
    return {
      label: CONTACT_LABELS[key] ?? key,
      value: (data.contact[key] as string | undefined) ?? "",
      multiline: false,
      isList: false,
    };
  }
  m = path.match(/^sectionTitles\.(\w+)$/);
  if (m) {
    const key = m[1] as SectionKey;
    const fallback = DEFAULT_SECTION_TITLES[key] ?? "";
    return {
      label: "Section heading",
      value: data.sectionTitles?.[key] ?? fallback,
      multiline: false,
      isList: false,
    };
  }
  m = path.match(/^leadership\[(\d+)\]\.(name|description|url)$/);
  if (m) {
    const lead = data.leadership[Number(m[1])];
    const key = m[2] as "name" | "description" | "url";
    return {
      label: `${lead?.name ?? "Leadership"} · ${key}`,
      value: (lead?.[key] as string | undefined) ?? "",
      multiline: key === "description",
      isList: false,
    };
  }
  m = path.match(/^skills\.(professional|soft)$/);
  if (m) {
    const cat = m[1] as "professional" | "soft";
    return {
      label: cat === "professional" ? "Professional skills" : "Soft skills",
      value: data.skills[cat].join("\n"),
      multiline: true,
      isList: true,
    };
  }
  m = path.match(/^experience\[(\d+)\]\.bullets\[(\d+)\]$/);
  if (m) {
    const exp = data.experience[Number(m[1])];
    const bullet = exp?.bullets[Number(m[2])] ?? "";
    return { label: `${exp?.company ?? "Experience"} · bullet`, value: bullet, multiline: true, isList: false };
  }
  m = path.match(/^experience\[(\d+)\]\.(role|company|period)$/);
  if (m) {
    const exp = data.experience[Number(m[1])];
    const key = m[2] as "role" | "company" | "period";
    return {
      label: `${exp?.company ?? "Experience"} · ${key}`,
      value: (exp?.[key] as string | undefined) ?? "",
      multiline: false,
      isList: false,
    };
  }
  m = path.match(/^education\[(\d+)\]\.(institution|degree|period|note)$/);
  if (m) {
    const edu = data.education[Number(m[1])];
    const key = m[2] as "institution" | "degree" | "period" | "note";
    return {
      label: `${edu?.institution ?? "Education"} · ${key}`,
      value: (edu?.[key] as string | undefined) ?? "",
      multiline: key === "note",
      isList: false,
    };
  }
  return null;
}

export function writePath(data: CvData, path: string, raw: string): CvData {
  const next: CvData = structuredClone(data);
  if (path === "summary") {
    next.summary = raw;
    next.header.summary = raw;
    return next;
  }
  if (path === "header.title") {
    next.header.title = raw;
    return next;
  }
  if (path === "header.name") {
    next.header.name = raw;
    return next;
  }
  if (path === "header.website") {
    next.header.website = raw.trim() || undefined;
    return next;
  }
  let m = path.match(/^contact\.(email|phone|location|linkedin)$/);
  if (m) {
    const key = m[1] as "email" | "phone" | "location" | "linkedin";
    const v = raw.trim();
    if (v) next.contact[key] = v;
    else delete next.contact[key];
    return next;
  }
  m = path.match(/^sectionTitles\.(\w+)$/);
  if (m) {
    const key = m[1] as SectionKey;
    const v = raw.trim();
    next.sectionTitles = { ...(next.sectionTitles ?? {}) };
    // Empty / equal-to-default → clear the override so the default shows.
    if (!v || v === DEFAULT_SECTION_TITLES[key]) delete next.sectionTitles[key];
    else next.sectionTitles[key] = v;
    return next;
  }
  m = path.match(/^leadership\[(\d+)\]\.(name|description|url)$/);
  if (m) {
    const i = Number(m[1]);
    const key = m[2] as "name" | "description" | "url";
    if (next.leadership[i]) {
      if (key === "url") next.leadership[i]!.url = raw.trim() || undefined;
      else next.leadership[i]![key] = raw;
    }
    return next;
  }
  m = path.match(/^skills\.(professional|soft)$/);
  if (m) {
    const cat = m[1] as "professional" | "soft";
    next.skills[cat] = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    return next;
  }
  m = path.match(/^experience\[(\d+)\]\.bullets\[(\d+)\]$/);
  if (m) {
    const ei = Number(m[1]);
    const bi = Number(m[2]);
    if (next.experience[ei]) next.experience[ei]!.bullets[bi] = raw;
    return next;
  }
  m = path.match(/^experience\[(\d+)\]\.(role|company|period)$/);
  if (m) {
    const ei = Number(m[1]);
    const key = m[2] as "role" | "company" | "period";
    if (next.experience[ei]) next.experience[ei]![key] = raw;
    return next;
  }
  m = path.match(/^education\[(\d+)\]\.(institution|degree|period|note)$/);
  if (m) {
    const ei = Number(m[1]);
    const key = m[2] as "institution" | "degree" | "period" | "note";
    if (next.education[ei]) next.education[ei]![key] = raw;
    return next;
  }
  return next;
}
