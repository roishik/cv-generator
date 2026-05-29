"use client";

/**
 * CvPreview — the ALWAYS-LIVE true-A4 CV preview, rendered with the SAME
 * render-engine React components + CSS that drive the server PDF (parity).
 *
 * It mounts the template (Sidebar / Clean) into a sandboxed iframe via a React
 * portal, so the CV's global stylesheet (which sets html/body sizing, fonts,
 * print-color-adjust) is fully isolated from the app chrome — and the markup is
 * byte-identical to what `renderCvToHtml` emits server-side for the PDF.
 *
 * On top of the iframe we draw, in app-space:
 *   - amber diff overlays keyed off the render engine's stable `data-field`
 *     hooks (added / rewritten / removed / reordered — never colour-alone:
 *     each carries a label + icon),
 *   - an inline-edit affordance: clicking a field bubbles its path up so the
 *     workspace can open an editor anchored to it.
 *
 * The A4 page (794×1123) is scaled to fit the container width via CSS transform.
 * Content height is measured client-side for the live one-page-fit gauge; the
 * authoritative fit is the server render (reRenderDocument / runTailoring).
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { Sidebar } from "@/lib/render-engine/templates/Sidebar";
import { Clean } from "@/lib/render-engine/templates/Clean";
import { buildCss } from "@/lib/render-engine/css";
import { fontFaceCss } from "@/lib/render-engine/fonts/fonts";
import { defaultThemeFor } from "@/lib/render-engine/themes/registry";
import type { CvData, TemplateId, ThemeTokens } from "@/lib/schemas/cv-data";

const A4_W = 794;
const A4_H = 1123;

const TEMPLATES = { sidebar: Sidebar, clean: Clean } as const;

export interface CvPreviewProps {
  data: CvData;
  templateId: TemplateId;
  theme?: ThemeTokens;
  /** When true, the diff overlay markers are painted on top of the matching fields. */
  showChanges?: boolean;
  /** Field paths (dotted) to mark as changed → drives the amber overlay. */
  changedPaths?: Record<string, "added" | "rewritten" | "removed" | "reordered">;
  /** A field path to scroll-to + flash (set by a Changes jump-link). */
  focusPath?: string | null;
  /** Click-to-edit: receives the dotted path of the clicked field. */
  onFieldClick?: (path: string) => void;
  /** Reports measured content height (px, A4 scale) for the fit gauge. */
  onMeasure?: (contentHeightPx: number) => void;
}

/** Map a DOM node (carrying data-* hooks) to a dotted CvData path, if any. */
function pathForNode(el: Element): string | null {
  const field = el.closest<HTMLElement>("[data-field]");
  if (!field) return null;
  const name = field.getAttribute("data-field");
  if (!name) return null;

  const exp = field.closest<HTMLElement>("[data-exp-index]");
  if (exp) {
    const i = exp.getAttribute("data-exp-index");
    if (name === "bullets") {
      const li = el.closest("li");
      if (li) {
        const idx = Array.from(li.parentElement?.children ?? []).indexOf(li);
        return `experience[${i}].bullets[${idx}]`;
      }
    }
    if (name === "company") return `experience[${i}].company`;
    if (name === "title") return `experience[${i}].role`;
    if (name === "period") return `experience[${i}].period`;
    return `experience[${i}].${name}`;
  }
  const edu = field.closest<HTMLElement>("[data-edu-index]");
  if (edu) return `education[${edu.getAttribute("data-edu-index")}].${name}`;

  if (name === "professional" || name === "soft") return `skills.${name}`;
  if (name === "summary") return "summary";
  if (name === "title") return "header.title";
  if (name === "name") return "header.name";
  return name;
}

export function CvPreview({
  data,
  templateId,
  theme,
  showChanges = false,
  changedPaths = {},
  focusPath = null,
  onFieldClick,
  onMeasure,
}: CvPreviewProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [mountEl, setMountEl] = React.useState<HTMLElement | null>(null);
  const [scale, setScale] = React.useState(1);

  const Template = TEMPLATES[templateId];
  const resolvedTheme = React.useMemo(
    () => theme ?? defaultThemeFor(templateId),
    [theme, templateId],
  );

  // Bootstrap the iframe document once: inject reset + fonts + a mount node.
  const onIframeLoad = React.useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const root = doc.getElementById("cv-root");
    if (root) setMountEl(root);
  }, []);

  // Re-inject the template CSS whenever the theme/template changes.
  React.useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    let style = doc.getElementById("cv-css") as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement("style");
      style.id = "cv-css";
      doc.head.appendChild(style);
    }
    style.textContent = `${fontFaceCss()}\n${buildCss(resolvedTheme)}`;
  }, [resolvedTheme, mountEl]);

  // Fit-to-width scaling (responsive). Recomputes on resize.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const avail = el.clientWidth - 2; // hairline guard
      const s = Math.min(1, avail / A4_W);
      setScale(s > 0 ? s : 1);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Measure rendered content height for the live fit gauge.
  React.useEffect(() => {
    if (!mountEl) return;
    const measure = () => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      // For sidebar the page is a fixed grid; main content drives overflow.
      const page = doc.querySelector<HTMLElement>(".cv-page");
      const body = doc.body;
      let h: number;
      if (templateId === "sidebar" && page) {
        const main = page.querySelector<HTMLElement>(".main-content");
        h = main ? main.scrollHeight + 48 /* top pad approx */ : page.scrollHeight;
      } else {
        h = body.scrollHeight;
      }
      onMeasure?.(h);
    };
    const id = window.setTimeout(measure, 60);
    return () => window.clearTimeout(id);
  }, [data, resolvedTheme, templateId, mountEl, onMeasure]);

  // Delegate clicks inside the iframe to the field-click handler.
  React.useEffect(() => {
    if (!mountEl || !onFieldClick) return;
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const path = pathForNode(target);
      if (path) {
        e.preventDefault();
        onFieldClick(path);
      }
    };
    doc.body.addEventListener("click", handler);
    return () => doc.body.removeEventListener("click", handler);
  }, [mountEl, onFieldClick]);

  // Paint / clear diff overlays + edit cursor on the live DOM.
  React.useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !mountEl) return;
    // clear previous markers
    doc.querySelectorAll("[data-diff-marker]").forEach((n) => {
      n.removeAttribute("data-diff-marker");
      (n as HTMLElement).style.removeProperty("background");
      (n as HTMLElement).style.removeProperty("text-decoration");
      (n as HTMLElement).style.removeProperty("box-shadow");
    });
    if (onFieldClick) {
      doc.querySelectorAll<HTMLElement>("[data-field]").forEach((n) => {
        n.style.cursor = "text";
      });
    }
    if (!showChanges) return;
    for (const [path, kind] of Object.entries(changedPaths)) {
      const node = nodeForPath(doc, path);
      if (!node) continue;
      node.setAttribute("data-diff-marker", kind);
      // amber emphasis — paired with decoration so it is never colour-alone
      if (kind === "removed") {
        node.style.textDecoration = "line-through";
        node.style.background = "rgba(178,59,46,0.10)";
      } else {
        node.style.background = "rgba(248,236,212,0.85)";
        node.style.boxShadow = "inset 0 -2px 0 0 #B5740F";
      }
    }
  }, [showChanges, changedPaths, data, resolvedTheme, mountEl, onFieldClick]);

  // Scroll-to + flash a focused field (Changes jump-link).
  React.useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !mountEl || !focusPath) return;
    const node = nodeForPath(doc, focusPath);
    if (!node) return;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    const prev = node.style.outline;
    node.style.outline = "2px solid #B5740F";
    node.style.outlineOffset = "2px";
    const id = window.setTimeout(() => {
      node.style.outline = prev;
    }, 1400);
    return () => window.clearTimeout(id);
  }, [focusPath, mountEl, data]);

  const scaledH = A4_H * scale;

  return (
    <div ref={containerRef} className="w-full" style={{ height: scaledH }}>
      <div
        style={{
          width: A4_W,
          height: A4_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <iframe
          ref={iframeRef}
          title="CV preview"
          onLoad={onIframeLoad}
          // a minimal seed doc; CSS + React tree are injected post-load
          srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0"><div id="cv-root"></div></body></html>`}
          style={{ width: A4_W, height: A4_H, border: "0", display: "block" }}
          sandbox="allow-same-origin"
        />
        {mountEl &&
          createPortal(
            <Template data={data} theme={resolvedTheme} />,
            mountEl,
          )}
      </div>
    </div>
  );
}

/** Resolve a dotted CvData path back to its rendered DOM node. */
function nodeForPath(doc: Document, path: string): HTMLElement | null {
  // experience[i].bullets[j]
  let m = path.match(/^experience\[(\d+)\]\.bullets\[(\d+)\]$/);
  if (m) {
    const exp = doc.querySelector(`[data-exp-index="${m[1]}"]`);
    const ul = exp?.querySelector('[data-field="bullets"]');
    return (ul?.children[Number(m[2])] as HTMLElement) ?? null;
  }
  m = path.match(/^experience\[(\d+)\]\.(\w+)$/);
  if (m) {
    const exp = doc.querySelector(`[data-exp-index="${m[1]}"]`);
    const field = m[2] === "role" ? "title" : m[2];
    return exp?.querySelector<HTMLElement>(`[data-field="${field}"]`) ?? (exp as HTMLElement) ?? null;
  }
  m = path.match(/^experience\[(\d+)\]$/);
  if (m) return doc.querySelector<HTMLElement>(`[data-exp-index="${m[1]}"]`);
  m = path.match(/^skills\.(\w+)$/);
  if (m) return doc.querySelector<HTMLElement>(`[data-field="${m[1]}"]`);
  if (path === "summary") return doc.querySelector<HTMLElement>('[data-field="summary"]');
  if (path === "header.title") {
    const header = doc.querySelector('[data-section="header"]');
    return header?.querySelector<HTMLElement>('[data-field="title"]') ?? null;
  }
  m = path.match(/^education\[(\d+)\]\.(\w+)$/);
  if (m) {
    const edu = doc.querySelector(`[data-edu-index="${m[1]}"]`);
    return edu?.querySelector<HTMLElement>(`[data-field="${m[2]}"]`) ?? (edu as HTMLElement) ?? null;
  }
  return null;
}
