import type { ThemeTokens } from "@/lib/schemas/cv-data";

// Reproduces cv-clean.html (Type 2, centered clean). Values pulled 1:1 from
// planning/04-master-plan.md §3 + the original HTML.
export const cleanDefault: ThemeTokens = {
  id: "clean-default",
  templateId: "clean",
  page: { widthPx: 794, heightPx: 1123, safeBottomPx: 12 },
  font: {
    family: "Source Sans 3",
    baseSizePt: 10.0,
    scale: { name: 2.2, title: 1.05, sectionHeader: 1.0, body: 1.0, small: 0.96 },
    lineHeight: 1.3,
    letterSpacingEm: { title: 0.05, header: 0.15 },
  },
  color: {
    primary: "#111111",
    text: "#111111",
    accent: "#444444",
    onPrimary: "#FFFFFF",
    rule: "#111111",
    background: "#FFFFFF",
  },
  layout: {
    sidebarWidthPx: null,
    pagePaddingPx: { top: 22, right: 52, bottom: 22, left: 52 },
    sectionGapPx: 9,
    entryGapPx: 9,
    bulletGapPx: 3,
    skillGapPx: 3,
  },
  bullet: { style: "disc", color: "#111111" },
};
