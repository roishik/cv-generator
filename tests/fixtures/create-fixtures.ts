/**
 * Script to create minimal PDF and DOCX test fixtures.
 * Run once: tsx tests/fixtures/create-fixtures.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const FIXTURES_DIR = path.join(import.meta.dirname ?? __dirname);

mkdirSync(FIXTURES_DIR, { recursive: true });

// ─── Minimal valid PDF ────────────────────────────────────────────────────────
// Hand-crafted minimal PDF with readable text content for parsing tests.
// Based on the PDF spec (minimal required objects for a single-page document).
const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj

4 0 obj
<< /Length 220 >>
stream
BT
/F1 12 Tf
50 750 Td
(Dana Whitfield) Tj
0 -20 Td
(dana@example.com) Tj
0 -30 Td
(Senior Product Manager at Northstar AI) Tj
0 -20 Td
(2021 - Present) Tj
0 -20 Td
(- Led developer platform launch to 40000 MAU) Tj
ET
endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000538 00000 n

trailer
<< /Size 6 /Root 1 0 R >>
startxref
617
%%EOF`;

writeFileSync(path.join(FIXTURES_DIR, "sample-resume.pdf"), pdfContent);

// ─── Minimal valid DOCX ───────────────────────────────────────────────────────
// A DOCX is a ZIP with specific XML files.
// We build a minimal valid OOXML zip from scratch using raw zip construction.
import { Buffer } from "node:buffer";

// Build a minimal DOCX from scratch using JSZip-like structure
// The simplest approach: create a valid OOXML zip

// Minimal document.xml content
const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml/extras" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:aink="http://schemas.microsoft.com/office/drawing/2016/ink" xmlns:am3d="http://schemas.microsoft.com/office/drawing/2017/model3d" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:oel="http://schemas.microsoft.com/office/2019/extlst" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:w16="http://schemas.microsoft.com/office/word/2018/wordml/extras" xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex" xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid" xmlns:w16sdtdh="http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash" xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex" xmlns:wpml="http://schemas.microsoft.com/office/word/2020/wordml/persist" xmlns:wxml="http://schemas.microsoft.com/office/word/2020/svg/main" mc:Ignorable="w14 w15 w16 w16cex w16cid w16sdtdh w16se wp14"><w:body><w:p><w:r><w:t>Dana Whitfield</w:t></w:r></w:p><w:p><w:r><w:t>dana@example.com</w:t></w:r></w:p><w:p><w:r><w:t>Senior Product Manager at Northstar AI, 2021 - Present</w:t></w:r></w:p><w:p><w:r><w:t>Led developer platform launch to 40000 MAU in 14 months.</w:t></w:r></w:p><w:p><w:r><w:t>Defined API roadmap with engineering team.</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`;

const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

// We need to create a real ZIP (DOCX format). Use the 'jszip' approach.
// Since we can't easily create a valid DOCX without a zip library in a plain script,
// let's generate it with node's built-in zlib and a manual ZIP construction.

function writeZipEntry(
  name: string,
  content: string,
  crc: number,
): { header: Buffer; data: Buffer; crc: number; compSize: number; uncompSize: number } {
  const data = Buffer.from(content, "utf8");
  const uncompSize = data.length;
  const compSize = data.length; // stored (no compression)

  // Local file header
  const nameBytes = Buffer.from(name, "utf8");
  const header = Buffer.alloc(30 + nameBytes.length);
  header.writeUInt32LE(0x04034b50, 0); // signature
  header.writeUInt16LE(20, 4); // version needed
  header.writeUInt16LE(0, 6); // flags
  header.writeUInt16LE(0, 8); // compression (stored)
  header.writeUInt16LE(0, 10); // mod time
  header.writeUInt16LE(0, 12); // mod date
  header.writeUInt32LE(crc, 14); // crc32
  header.writeUInt32LE(compSize, 18); // compressed size
  header.writeUInt32LE(uncompSize, 22); // uncompressed size
  header.writeUInt16LE(nameBytes.length, 26); // name length
  header.writeUInt16LE(0, 28); // extra length
  nameBytes.copy(header, 30);

  return { header, data, crc, compSize, uncompSize };
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildDocx(): Buffer {
  const entries: Array<{
    name: string;
    headerOffset: number;
    header: Buffer;
    data: Buffer;
    crc: number;
    compSize: number;
    uncompSize: number;
  }> = [];

  const files = [
    { name: "[Content_Types].xml", content: contentTypesXml },
    { name: "_rels/.rels", content: relsXml },
    { name: "word/document.xml", content: documentXml },
    { name: "word/_rels/document.xml.rels", content: wordRelsXml },
  ];

  const parts: Buffer[] = [];
  let offset = 0;

  for (const { name, content } of files) {
    const dataBuf = Buffer.from(content, "utf8");
    const crc = crc32(dataBuf);
    const entry = writeZipEntry(name, content, crc);
    entries.push({ name, headerOffset: offset, ...entry });
    parts.push(entry.header, entry.data);
    offset += entry.header.length + entry.data.length;
  }

  // Central directory
  const cdParts: Buffer[] = [];
  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const cd = Buffer.alloc(46 + nameBytes.length);
    cd.writeUInt32LE(0x02014b50, 0); // signature
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // flags
    cd.writeUInt16LE(0, 10); // compression
    cd.writeUInt16LE(0, 12); // mod time
    cd.writeUInt16LE(0, 14); // mod date
    cd.writeUInt32LE(entry.crc, 16); // crc
    cd.writeUInt32LE(entry.compSize, 20); // comp size
    cd.writeUInt32LE(entry.uncompSize, 24); // uncomp size
    cd.writeUInt16LE(nameBytes.length, 28); // name len
    cd.writeUInt16LE(0, 30); // extra len
    cd.writeUInt16LE(0, 32); // comment len
    cd.writeUInt16LE(0, 34); // disk start
    cd.writeUInt16LE(0, 36); // int attributes
    cd.writeUInt32LE(0, 38); // ext attributes
    cd.writeUInt32LE(entry.headerOffset, 42); // local header offset
    nameBytes.copy(cd, 46);
    cdParts.push(cd);
  }

  const cdBuffer = Buffer.concat(cdParts);
  const cdOffset = offset;

  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with cd
  eocd.writeUInt16LE(entries.length, 8); // entries on disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(cdBuffer.length, 12); // cd size
  eocd.writeUInt32LE(cdOffset, 16); // cd offset
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([...parts, cdBuffer, eocd]);
}

const docxBuffer = buildDocx();
writeFileSync(path.join(FIXTURES_DIR, "sample-resume.docx"), docxBuffer);

console.log("Fixtures created:");
console.log(`  ${path.join(FIXTURES_DIR, "sample-resume.pdf")} (${pdfContent.length} bytes)`);
console.log(`  ${path.join(FIXTURES_DIR, "sample-resume.docx")} (${docxBuffer.length} bytes)`);
