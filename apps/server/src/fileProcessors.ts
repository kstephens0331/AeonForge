// apps/server/src/fileProcessors.ts
// Process various file types into text for RAG ingestion

import { Readable } from "node:stream";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execAsync = promisify(exec);

/**
 * Extract text from PDF using pdftotext (from poppler-utils)
 * Fallback: basic extraction if tools not available
 */
async function extractPDF(buffer: Buffer): Promise<string> {
  const tempDir = join(tmpdir(), "aeonforge-files");
  await mkdir(tempDir, { recursive: true });

  const timestamp = Date.now();
  const pdfPath = join(tempDir, `file-${timestamp}.pdf`);
  const txtPath = join(tempDir, `file-${timestamp}.txt`);

  try {
    await writeFile(pdfPath, buffer);

    // Try pdftotext (Linux/Mac with poppler-utils installed)
    try {
      await execAsync(`pdftotext "${pdfPath}" "${txtPath}"`, { timeout: 30000 });
      const { readFile } = await import("node:fs/promises");
      const text = await readFile(txtPath, "utf-8");
      return text;
    } catch (pdftotextError) {
      // Fallback: basic string extraction (less reliable)
      const text = buffer.toString("utf-8", 0, Math.min(buffer.length, 500000));
      const cleaned = text.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();

      if (cleaned.length < 100) {
        throw new Error("PDF text extraction failed. Install poppler-utils (pdftotext) for better support.");
      }
      return cleaned;
    }
  } finally {
    // Cleanup
    try { await unlink(pdfPath); } catch {}
    try { await unlink(txtPath); } catch {}
  }
}

/**
 * Extract text from Word documents (.docx)
 * Uses simple XML parsing of document.xml
 */
async function extractDocx(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import to avoid bundling large libraries
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(buffer);
    const documentXml = zip.readAsText("word/document.xml");

    // Extract text from XML (basic regex approach)
    const textMatches = documentXml.matchAll(/<w:t[^>]*>([^<]+)<\/w:t>/g);
    const texts = Array.from(textMatches).map(m => m[1]);

    return texts.join(" ").replace(/\s+/g, " ").trim();
  } catch (e: any) {
    throw new Error("Failed to extract .docx content. Install adm-zip: pnpm add adm-zip");
  }
}

/**
 * Process code files - already text, just validate
 */
function processCode(buffer: Buffer, extension: string): string {
  const SUPPORTED_EXTENSIONS = [
    ".js", ".ts", ".tsx", ".jsx", ".py", ".java", ".c", ".cpp", ".h", ".hpp",
    ".cs", ".rb", ".go", ".rs", ".php", ".swift", ".kt", ".scala", ".sh",
    ".html", ".css", ".scss", ".sql", ".json", ".yaml", ".yml", ".xml",
    ".md", ".txt", ".env", ".config", ".toml"
  ];

  if (!SUPPORTED_EXTENSIONS.includes(extension.toLowerCase())) {
    throw new Error(`Unsupported code file extension: ${extension}`);
  }

  try {
    return buffer.toString("utf-8");
  } catch {
    throw new Error("File is not valid UTF-8 text");
  }
}

/**
 * Main file processor router
 */
export async function processFile(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<{ text: string; processedAs: string }> {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();

  // PDF
  if (mimeType === "application/pdf" || ext === ".pdf") {
    const text = await extractPDF(buffer);
    return { text, processedAs: "pdf" };
  }

  // Word
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === ".docx"
  ) {
    const text = await extractDocx(buffer);
    return { text, processedAs: "docx" };
  }

  // Code/Text files
  if (mimeType.startsWith("text/") || [
    ".js", ".ts", ".tsx", ".jsx", ".py", ".java", ".c", ".cpp", ".h", ".hpp",
    ".cs", ".rb", ".go", ".rs", ".php", ".swift", ".kt", ".scala", ".sh",
    ".html", ".css", ".scss", ".sql", ".json", ".yaml", ".yml", ".xml",
    ".md", ".txt", ".env", ".config", ".toml"
  ].includes(ext)) {
    const text = processCode(buffer, ext);
    return { text, processedAs: "code" };
  }

  throw new Error(`Unsupported file type: ${mimeType} (${ext})`);
}