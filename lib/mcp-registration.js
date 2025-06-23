'use babel';
import fs from "fs";
import path from "path";
import { z } from "zod";

// Register Tools
export function mcpRegistration(server) {
  {
    const curTool = "delete-line";
    console.log("Registering Tool: " + curTool);
    server.registerTool(
      curTool,
      {
        title: "Delete Line",
        description: "Delete the specified line number (1-based).",
        inputSchema: { lineNumber: z.number() }
      },
      async ({ lineNumber }) => {
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) throw new Error("No active editor");

        const buffer = editor.getBuffer();
        const totalLines = buffer.getLineCount();
        const rowIndex = lineNumber - 1;  // convert to 0-based

        if (rowIndex < 0 || rowIndex >= totalLines) {
          throw new Error(`lineNumber ${lineNumber} is out of range (1–${totalLines})`);
        }

        // Delete exactly that one row
        buffer.deleteRow(rowIndex);

        console.log(`CMD: ${curTool}, ARGS:`, { lineNumber });
        return {
          content: [
            { type: "text", text: `Deleted line ${lineNumber}` }
          ]
        };
      }
    );
  }

  {
    const curTool = "delete-line-range";
    console.log("Registering Tool: " + curTool);
    server.registerTool(
      curTool,
      {
        title: "Delete Line Range",
        description: "Delete all lines from startLine to endLine (inclusive). For a single line, set startLine === endLine. Line numbers are 1-based.",
        inputSchema: { startLine: z.number(), endLine: z.number() }
      },
      async ({ startLine, endLine }) => {
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) throw new Error("No active editor");
        const buffer = editor.getBuffer();
        const totalLines = buffer.getLineCount();

        // convert to 0-based and clamp
        const startRow = Math.max(0, startLine - 1);
        const endRow   = Math.min(endLine   - 1, totalLines - 1);

        if (startRow > endRow) {
          throw new Error(`startLine (${startLine}) must be ≤ endLine (${endLine})`);
        }

        // delete each row individually, from bottom up
        for (let row = endRow; row >= startRow; row--) {
          buffer.deleteRow(row);
        }

        console.log(`CMD: ${curTool}, ARGS: ${JSON.stringify({ startLine, endLine })}`);
        return {
          content: [
            {
              type: "text",
              text: `Deleted lines ${startLine} to ${endLine}`
            }
          ]
        };
      }
    );
  }

  {
    const curTool = "get-selection";
    console.log("Registering Tool: " + curTool);
    server.registerTool(curTool,
      {
        title: "Get Selection",
        description: "Return the text currently selected in the active editor.",
        inputSchema: {}
      },
      async (args) => {
        console.log("CMD: " + curTool + ", ARGS: " + JSON.stringify(args));
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) throw new Error("No active editor");
        const selection = editor.getSelectedText();
        return {
          content: [
            {
              type: "text",
              text: selection || "[no text selected]"
            }
          ]
        };
      }
    );
  }

  {
    const curTool = "get-document";
    console.log("Registering Tool: " + curTool);
    server.registerTool(curTool,
      {
        title: "Get Document with Line Numbers",
        description: "Return each line prefixed with its line number.",
        inputSchema: {}
      },
      async (args) => {
        console.log("CMD: " + curTool + ", ARGS: " + JSON.stringify(args));
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) throw new Error("No active editor");
        const lines = editor.getText().split(/\r?\n/);
        const content = lines.map((line, idx) => ({
          type: "text",
          text: `${idx + 1}: ${line}`
        }));
        return { content };
      }
    );
  }

  {
    const curTool = "get-line-count";
    console.log("Registering Tool: " + curTool);
    server.registerTool(curTool,
      {
        title: "Get Line Count",
        description: "Return the total number of lines in the active editor.",
        inputSchema: {}
      },
      async (args) => {
        console.log("CMD: " + curTool + ", ARGS: " + JSON.stringify(args));
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) throw new Error("No active editor");
        const lineCount = editor.getBuffer().getLineCount();
        return {
          content: [
            {
              type: "text",
              text: String(lineCount)
            }
          ]
        };
      }
    );
  }

  {
    const curTool = "get-filename";
    console.log("Registering Tool: " + curTool);
    server.registerTool(curTool,
      {
        title: "Get Filename",
        description: "Return the filename of the active editor (or [untitled] if none).",
        inputSchema: {}
      },
      async (args) => {
        console.log("CMD: " + curTool + ", ARGS: " + JSON.stringify(args));
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) throw new Error("No active editor");
        const fullPath = editor.getPath();
        const fileName = fullPath ? path.basename(fullPath) : "[untitled]";
        return {
          content: [
            {
              type: "text",
              text: fileName
            }
          ]
        };
      }
    );
  }

  {
    const curTool = "get-full-path";
    console.log("Registering Tool: " + curTool);
    server.registerTool(curTool,
      {
        title: "Get Full File Path",
        description: "Return the full absolute path of the active editor.",
        inputSchema: {}
      },
      async (args) => {
        console.log("CMD: " + curTool + ", ARGS: " + JSON.stringify(args));
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) throw new Error("No active editor");
        const fullPath = editor.getPath() || "[untitled]";
        return {
          content: [
            { type: "text", text: fullPath }
          ]
        };
      }
    );
  }

  {
    const curTool = "get-project-files";
    console.log("Registering Tool: " + curTool);
    server.registerTool(curTool,
      {
        title: "Get Project Files",
        description: "Return a newline-separated list of all files under the current project roots.",
        inputSchema: {}
      },
      async (args) => {
        console.log("CMD: " + curTool + ", ARGS: " + JSON.stringify(args));
        const roots = atom.project.getPaths();
        const files = [];
        async function walk(dir) {
          const entries = await fs.promises.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              await walk(full);
            } else {
              files.push(full);
            }
          }
        }
        for (const root of roots) {
          await walk(root);
        }
        return {
          content: [
            { type: "text", text: files.join("\n") }
          ]
        };
      }
    );
  }

  {
    const curTool = "open-file";
    console.log("Registering Tool: " + curTool);
    server.registerTool(curTool,
      {
        title: "Open File",
        description: "Open (or switch to) a tab for the given file path.",
        inputSchema: { filePath: z.string() }
      },
      async (args) => {
        console.log("CMD: " + curTool + ", ARGS: " + JSON.stringify(args));
        const { filePath } = args;
        await atom.workspace.open(filePath);
        return {
          content: [
            { type: "text", text: `Opened file: ${filePath}` }
          ]
        };
      }
    );
  }
}
