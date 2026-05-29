import type { TemplateId, ThemeTokens } from "@/lib/schemas/cv-data";
import { sidebarDefault } from "./sidebar-default";
import { cleanDefault } from "./clean-default";

export const themeRegistry: Record<TemplateId, ThemeTokens> = {
  sidebar: sidebarDefault,
  clean: cleanDefault,
};

/** Returns the default theme tokens for a template id. */
export function defaultThemeFor(templateId: TemplateId): ThemeTokens {
  return themeRegistry[templateId];
}

export { sidebarDefault, cleanDefault };
