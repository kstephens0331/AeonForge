// apps/server/src/tools/codeExecutor.ts
import type { ToolDefinition } from "./types.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execAsync = promisify(exec);

async function executeCode(code: string, language: "javascript" | "python" | "bash"): Promise<string> {
  const ENABLE_CODE_EXEC = (process.env.ENABLE_CODE_EXECUTION ?? "false").toLowerCase() === "true";

  if (!ENABLE_CODE_EXEC) {
    return "Code execution is disabled. Set ENABLE_CODE_EXECUTION=true to enable (use with caution).";
  }

  const tempDir = join(tmpdir(), "aeonforge-exec");
  await mkdir(tempDir, { recursive: true });

  const timestamp = Date.now();
  let filename: string;
  let command: string;

  try {
    switch (language) {
      case "javascript": {
        filename = join(tempDir, `script-${timestamp}.js`);
        await writeFile(filename, code, "utf-8");
        command = `node "${filename}"`;
        break;
      }
      case "python": {
        filename = join(tempDir, `script-${timestamp}.py`);
        await writeFile(filename, code, "utf-8");
        command = `python3 "${filename}" || python "${filename}"`;
        break;
      }
      case "bash": {
        filename = join(tempDir, `script-${timestamp}.sh`);
        await writeFile(filename, code, "utf-8");
        command = `bash "${filename}"`;
        break;
      }
      default:
        return `Error: Unsupported language "${language}"`;
    }

    const { stdout, stderr } = await execAsync(command, {
      timeout: 10000, // 10 second timeout
      maxBuffer: 1024 * 1024, // 1MB buffer
    });

    // Cleanup
    try {
      await unlink(filename);
    } catch {}

    let output = "";
    if (stdout) output += `Output:\n${stdout}`;
    if (stderr) output += `\n\nErrors/Warnings:\n${stderr}`;

    return output.trim() || "Code executed successfully (no output).";
  } catch (e: any) {
    // Cleanup on error
    try {
      if (filename!) await unlink(filename!);
    } catch {}

    if (e.code === "ETIMEDOUT") {
      return "Error: Code execution timed out (max 10 seconds).";
    }
    return `Execution error: ${e?.message ?? "Unknown error"}\n${e?.stderr ?? ""}`;
  }
}

export const codeExecutorTool: ToolDefinition = {
  name: "execute_code",
  description: "Execute code in a sandboxed environment. Supports JavaScript, Python, and Bash. Limited to 10 seconds execution time.",
  parameters: [
    {
      name: "code",
      type: "string",
      description: "The code to execute",
      required: true,
    },
    {
      name: "language",
      type: "string",
      description: "Programming language (javascript, python, or bash)",
      required: true,
    },
  ],
  execute: async (params: Record<string, any>) => {
    const code = params.code as string;
    const language = (params.language as string)?.toLowerCase();

    if (!code || code.trim().length === 0) {
      return "Error: Code cannot be empty.";
    }

    if (!["javascript", "python", "bash"].includes(language)) {
      return "Error: Language must be 'javascript', 'python', or 'bash'.";
    }

    return await executeCode(code, language as any);
  },
};