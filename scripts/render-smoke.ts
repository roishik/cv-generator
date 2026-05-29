import { writeFileSync, mkdirSync } from "fs";
import { sampleCvData } from "@/lib/render-engine/sample-data";
import { renderCvToPdf } from "@/lib/pdf/render-pdf";
import { closeBrowser } from "@/lib/pdf/browser-pool";
import { runQaChecks } from "@/lib/qa/assertions";
import type { TemplateId } from "@/lib/schemas/cv-data";

async function main() {
  mkdirSync("/tmp/cv-smoke", { recursive: true });
  for (const tpl of ["sidebar", "clean"] as TemplateId[]) {
    const res = await renderCvToPdf(sampleCvData, tpl);
    if (!res.fits) {
      console.log(`[${tpl}] FIT FAILURE:`, res.reason);
      continue;
    }
    writeFileSync(`/tmp/cv-smoke/${tpl}.pdf`, res.pdf);
    writeFileSync(`/tmp/cv-smoke/${tpl}.html`, res.html);
    const qa = await runQaChecks({
      pdf: res.pdf,
      html: res.html,
      templateId: tpl,
      expectedText: sampleCvData.header.name,
      contentHeightPx: res.contentHeightPx,
      pageHeightPx: res.theme.page.heightPx,
      safeBottomPx: res.theme.page.safeBottomPx,
    });
    console.log(`\n[${tpl}] rung=${res.rungUsed} bytes=${res.pdf.byteLength} contentH=${res.contentHeightPx.toFixed(0)}`);
    for (const c of qa.checks) console.log(`  ${c.pass ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`);
    console.log(`  => OK=${qa.ok}`);
  }
  await closeBrowser();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
