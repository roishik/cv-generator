import * as React from "react";
// Use the `.edge` entrypoint: it exposes renderToStaticMarkup and is the path
// Next.js permits inside the server/RSC graph (the bare `react-dom/server`
// import trips a Turbopack heuristic). Works identically under Node + vitest.
import { renderToStaticMarkup } from "react-dom/server.edge";
import { CvData, ThemeTokens, type TemplateId } from "@/lib/schemas/cv-data";
import type { CvData as CvDataT, ThemeTokens as ThemeTokensT } from "@/lib/schemas/cv-data";
import { buildCss } from "./css";
import { Sidebar } from "./templates/Sidebar";
import { Clean } from "./templates/Clean";
import { defaultThemeFor } from "./themes/registry";

const TEMPLATES = {
  sidebar: Sidebar,
  clean: Clean,
} as const;

/** Renders the body markup for a template (used by browser preview + server PDF). */
export function renderTemplateBody(data: CvDataT, theme: ThemeTokensT): string {
  const Component = TEMPLATES[theme.templateId];
  return renderToStaticMarkup(React.createElement(Component, { data, theme }));
}

/**
 * Pure, isomorphic renderer: (cvData, templateId, themeTokens) → full HTML string.
 * No DB, no network, no fs at runtime (fonts are base64-inlined). The SAME output
 * drives the in-browser live preview and the server-side Playwright PDF.
 */
export function renderCvToHtml(
  cvData: CvDataT,
  templateId: TemplateId,
  themeTokens?: ThemeTokensT,
): string {
  // Validate inputs at the boundary (deterministic, throws on bad data).
  const data = CvData.parse(cvData);
  const theme = ThemeTokens.parse(themeTokens ?? defaultThemeFor(templateId));
  if (theme.templateId !== templateId) {
    throw new Error(
      `Theme/template mismatch: theme.templateId=${theme.templateId} but templateId=${templateId}`,
    );
  }
  const css = buildCss(theme);
  const body = renderTemplateBody(data, theme);
  const lang = "en";
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(data.header.name)} — CV</title>
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
