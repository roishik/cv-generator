import type { ThemeTokens } from "@/lib/schemas/cv-data";

// Reproduces cv-main.html (Type 1, navy sidebar). Values pulled 1:1 from
// planning/04-master-plan.md §3 + cv-analysis.json + the original HTML.
export const sidebarDefault: ThemeTokens = {
  id: "sidebar-default",
  templateId: "sidebar",
  page: { widthPx: 794, heightPx: 1123, safeBottomPx: 12 },
  font: {
    family: "Lato",
    baseSizePt: 10.5,
    scale: { name: 3.14, title: 1.33, sectionHeader: 1.33, body: 1.0, small: 0.9 },
    lineHeight: 1.5,
    letterSpacingEm: { title: 0.2, header: 0.06 },
  },
  color: {
    primary: "#323B4C",
    text: "#737373",
    accent: "#323B4C",
    onPrimary: "#FFFFFF",
    rule: "#D0D0D0",
    background: "#FFFFFF",
  },
  layout: {
    sidebarWidthPx: 206,
    pagePaddingPx: { top: 36, right: 32, bottom: 12, left: 30 },
    sectionGapPx: 12,
    entryGapPx: 9,
    bulletGapPx: 2,
    skillGapPx: 7,
  },
  bullet: { style: "diamond", color: "#FFFFFF" },
};
