import type { ThemeTokens } from "@/lib/schemas/cv-data";
import { fontFaceCss } from "./fonts/fonts";

// Deterministic tokens → CSS. The SAME stylesheet drives the in-browser live
// preview and the server PDF render (parity). All fit-tunable values
// (sectionGap/entryGap/bulletGap/skillGap/lineHeight + font sizes) flow from the
// tokens so the auto-fit ladder works purely by mutating ThemeTokens.

const baseReset = `*{margin:0;padding:0;box-sizing:border-box;}
@page{size:A4;margin:0;}`;

/** body font size in pt for a given scale-role. */
function pt(t: ThemeTokens, role: keyof ThemeTokens["font"]["scale"]): string {
  return `${(t.font.baseSizePt * t.font.scale[role]).toFixed(2)}pt`;
}

/** Build the <style> contents for the sidebar (Type 1) template. */
function sidebarCss(t: ThemeTokens): string {
  const L = t.layout;
  const C = t.color;
  const sidebarW = L.sidebarWidthPx ?? 206;
  return `
html,body{width:${t.page.widthPx}px;height:${t.page.heightPx}px;font-family:'${t.font.family}',sans-serif;background:${C.background};overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.cv-page{width:${t.page.widthPx}px;height:${t.page.heightPx}px;display:grid;grid-template-columns:${sidebarW}px 1fr;background:${C.background};position:relative;}
.sidebar{width:${sidebarW}px;min-height:${t.page.heightPx}px;background-color:${C.primary};color:${C.onPrimary};display:flex;flex-direction:column;padding:0;overflow:hidden;}
.sidebar-photo{width:100%;display:flex;justify-content:center;align-items:center;padding:36px 0 28px 0;}
.photo-circle{width:118px;height:118px;border-radius:50%;background-color:#4a5568;border:3px solid rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;overflow:hidden;}
.photo-circle img{width:100%;height:100%;object-fit:cover;border-radius:50%;}
.photo-monogram{font-family:'${t.font.family}',sans-serif;font-weight:900;font-size:46px;color:${C.onPrimary};letter-spacing:0.02em;}
.sidebar-section{padding:${(t.layout.sectionGapPx).toFixed(0)}px 18px 14px 18px;}
.sidebar-section-header{font-family:'${t.font.family}',sans-serif;font-weight:700;font-size:14.5px;color:${C.onPrimary};letter-spacing:${t.font.letterSpacingEm.header + 0.02}em;text-transform:uppercase;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.3);}
.contact-item{display:flex;align-items:flex-start;margin-bottom:8px;gap:7px;}
.contact-icon{width:13px;height:13px;flex-shrink:0;margin-top:1px;opacity:0.85;}
.contact-text{font-family:'${t.font.family}',sans-serif;font-size:10px;color:${C.onPrimary};line-height:1.45;word-break:break-all;}
.skill-item{display:flex;align-items:flex-start;margin-bottom:${L.skillGapPx}px;gap:7px;}
.skill-bullet{width:5px;height:5px;background:${t.bullet.color};flex-shrink:0;margin-top:4px;transform:rotate(45deg);}
.skill-text{font-family:'${t.font.family}',sans-serif;font-size:9.5px;color:${C.onPrimary};line-height:1.5;}
.project-item{margin-bottom:11px;}
.project-name{font-family:'${t.font.family}',sans-serif;font-weight:700;font-size:9.5px;color:${C.onPrimary};margin-bottom:3px;}
.project-url{font-family:'${t.font.family}',sans-serif;font-style:italic;font-size:7.5px;color:rgba(255,255,255,0.75);display:block;margin-bottom:2px;}
.project-desc{font-family:'${t.font.family}',sans-serif;font-style:italic;font-size:9px;color:rgba(255,255,255,0.85);line-height:1.5;}
.project-desc a{color:inherit;text-decoration:underline;}
.sidebar-divider{height:1px;background:rgba(255,255,255,0.2);margin:0 18px;}
.main-content{padding:${L.pagePaddingPx.top}px ${L.pagePaddingPx.right}px ${L.pagePaddingPx.bottom}px ${L.pagePaddingPx.left}px;display:flex;flex-direction:column;overflow:hidden;}
.cv-header{margin-bottom:10px;}
.cv-name{font-family:'${t.font.family}',sans-serif;font-weight:900;font-size:${pt(t, "name")};color:${C.primary};line-height:1.1;letter-spacing:0.01em;margin-bottom:4px;}
.cv-title{font-family:'${t.font.family}',sans-serif;font-weight:400;font-size:${pt(t, "title")};color:${C.primary};letter-spacing:${t.font.letterSpacingEm.title}em;text-transform:uppercase;margin-bottom:10px;}
.cv-website{font-family:'${t.font.family}',sans-serif;font-style:italic;font-size:11px;color:#000000;text-decoration:none;display:block;margin-bottom:8px;}
.cv-summary{font-family:'${t.font.family}',sans-serif;font-size:12px;color:${C.text};line-height:${(t.font.lineHeight + 0.15).toFixed(2)};}
.main-divider{height:2px;background:${C.primary};margin:8px 0;}
.main-section-header{font-family:'${t.font.family}',sans-serif;font-weight:700;font-size:${pt(t, "sectionHeader")};color:${C.primary};letter-spacing:${t.font.letterSpacingEm.header}em;text-transform:uppercase;margin-bottom:7px;}
.experience-section{margin-bottom:4px;}
.experience-list{position:relative;padding-left:16px;}
.experience-list::before{content:'';position:absolute;left:4px;top:6px;bottom:6px;width:1px;background:${C.rule};}
.experience-entry{position:relative;margin-bottom:${L.entryGapPx}px;}
.experience-entry::before{content:'';position:absolute;left:-14px;top:6px;width:6px;height:6px;background:${C.text};transform:rotate(45deg);}
.exp-company-period{font-family:'${t.font.family}',sans-serif;font-weight:700;font-size:9.5px;color:${C.text};letter-spacing:0.03em;margin-bottom:1px;}
.exp-job-title{font-family:'${t.font.family}',sans-serif;font-weight:700;font-size:12.5px;color:${C.primary};margin-bottom:6px;}
.exp-bullets{list-style:none;padding:0;margin:0;}
.exp-bullet{font-family:'${t.font.family}',sans-serif;font-size:${pt(t, "body")};color:${C.text};line-height:${t.font.lineHeight};margin-bottom:${L.bulletGapPx}px;padding-left:10px;position:relative;}
.exp-bullet::before{content:'\\2022';position:absolute;left:0;color:${C.text};}
.education-section{margin-top:0px;}
.education-entry{margin-bottom:5px;}
.edu-institution{font-family:'${t.font.family}',sans-serif;font-weight:700;font-size:10.5px;color:${C.text};margin-bottom:2px;}
.edu-period{font-family:'${t.font.family}',sans-serif;font-size:10px;color:${C.text};margin-bottom:2px;}
.edu-degree{font-family:'${t.font.family}',sans-serif;font-weight:700;font-size:12px;color:${C.primary};margin-bottom:4px;}
.edu-note{font-family:'${t.font.family}',sans-serif;font-style:italic;font-size:9.5px;color:${C.text};line-height:1.45;}
.references-line{margin-top:auto;padding-top:10px;font-family:'${t.font.family}',sans-serif;font-style:italic;font-weight:700;font-size:9px;color:${C.text};text-align:center;}`;
}

/** Build the <style> contents for the clean (Type 2) template. */
function cleanCss(t: ThemeTokens): string {
  const L = t.layout;
  const C = t.color;
  return `
html,body{margin:0;padding:0;font-family:'${t.font.family}','Calibri','Arial',sans-serif;color:${C.text};-webkit-print-color-adjust:exact;print-color-adjust:exact;}
body{width:${t.page.widthPx}px;min-height:${t.page.heightPx}px;height:${t.page.heightPx}px;padding:${L.pagePaddingPx.top}px ${L.pagePaddingPx.right}px ${L.pagePaddingPx.bottom}px ${L.pagePaddingPx.left}px;font-size:${pt(t, "body")};line-height:${t.font.lineHeight};background:${C.background};overflow:hidden;}
header.cv-header{text-align:center;margin-bottom:14px;}
header.cv-header .name{font-size:${pt(t, "name")};font-weight:700;letter-spacing:1.5px;margin:0 0 2px 0;text-transform:uppercase;}
header.cv-header .title{font-size:${pt(t, "title")};font-weight:600;color:${C.accent};letter-spacing:0.5px;margin:0 0 4px 0;}
header.cv-header .contact{font-size:${pt(t, "small")};color:#222;}
header.cv-header .contact span,header.cv-header .contact a{margin:0 6px;}
header.cv-header .contact a{color:#222;text-decoration:none;}
section{margin-bottom:${L.sectionGapPx + 1}px;}
h2.section-title{font-size:${pt(t, "sectionHeader")};font-weight:700;letter-spacing:${t.font.letterSpacingEm.header * 10}px;text-transform:uppercase;margin:${L.sectionGapPx}px 0 5px 0;padding-bottom:2px;border-bottom:1px solid ${C.rule};}
.summary{font-size:${pt(t, "body")};line-height:${(t.font.lineHeight + 0.12).toFixed(2)};margin:0 0 4px 0;text-align:justify;}
.entry{margin-bottom:${L.entryGapPx}px;}
.entry-row{display:flex;justify-content:space-between;align-items:baseline;}
.entry-row .left{font-weight:700;font-size:${(t.font.baseSizePt * 1.04).toFixed(2)}pt;}
.entry-row .left .org{font-weight:700;}
.entry-row .left .sep{font-weight:400;color:${C.accent};margin:0 4px;}
.entry-row .left .role{font-weight:600;font-style:italic;}
.entry-row .right{font-size:${(t.font.baseSizePt * 0.96).toFixed(2)}pt;color:#333;font-weight:600;white-space:nowrap;}
ul.bullets{margin:3px 0 3px 18px;padding:0;}
ul.bullets li{margin-bottom:${L.bulletGapPx}px;line-height:${(t.font.lineHeight + 0.12).toFixed(2)};text-align:justify;}
.edu-note{font-style:italic;font-size:${(t.font.baseSizePt * 0.96).toFixed(2)}pt;color:#333;margin:0;}
.skills-line{margin:${L.skillGapPx}px 0;line-height:1.40;}
.skills-line .label{font-weight:700;}
.skills-line .skills-inline{display:inline;}
.skills-line .skill-item{display:inline;}
.skills-line .skill-bullet{display:none;}
.skills-line .skill-text{font-size:${pt(t, "body")};}
.skills-line .skill-item .skill-text::after{content:" \\00B7 ";color:#888;}
.skills-line .skill-item:last-child .skill-text::after{content:"";}
.languages-line{margin:${L.skillGapPx}px 0;line-height:1.40;font-size:${pt(t, "body")};}
.languages-line .label{font-weight:700;}`;
}

/** Returns the full CSS (fonts + reset + template-specific) for a theme. */
export function buildCss(theme: ThemeTokens): string {
  const tpl = theme.templateId === "sidebar" ? sidebarCss(theme) : cleanCss(theme);
  return `${fontFaceCss()}\n${baseReset}\n${tpl}`;
}
