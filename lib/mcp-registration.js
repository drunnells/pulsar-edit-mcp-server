'use babel';
import fs from "fs";
import path from "path";
import { z } from "zod";

// Register Tools
export function mcpRegistration(server) {
    server.registerTool("move-cursor", {
        title: "Move Cursor",
        description: "Move cursor to location in editor.",
        inputSchema: { row: z.number(), column: z.number() }
      },
      async ({ row, column }) => {
        const editor = atom.workspace.getActiveTextEditor();
        editor.setCursorBufferPosition([row, column]);
        return {
          content: [{ type: "text", text: String("Moved cursor to row " + row + ", column " + column) }]
        };
    });

    server.registerTool("select-range", {
        title: "Select Range",
        description: "Select text from position to position.",
        inputSchema: { startRow: z.number(), startColumn: z.number(), endRow: z.number(), endColumn: z.number() }
      },
      async ({ startRow, startColumn, endRow, endColumn }) => {
        const editor = atom.workspace.getActiveTextEditor();
        const start = [startRow, startColumn];
        const end = [endRow, endColumn];
        editor.setSelectedBufferRange([start, end]);
        return {
          content: [{ type: "text", text: String("Selected text from row " + startRow + ", column " + startColumn + " to " + endRow + ", column " + endColumn) }]
        };
    });

    server.registerTool("insert-text", {
        title: "Insert Text",
        description: "Insert text at current cursor position.",
        inputSchema: { text: z.string() }
      },
      async ({ text }) => {
        const editor = atom.workspace.getActiveTextEditor();
        editor.insertText(text);
        return {
          content: [{ type: "text", text: String("Inserted text: " + text) }]
        };
    });

    server.registerTool(
      "get-selection",
      {
        title: "Get Selection",
        description: "Return the text currently selected in the active editor.",
        inputSchema: {}
      },
      async () => {
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) {
          throw new Error("No active text editor");
        }

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

    server.registerTool(
      "get-document",
      {
        title: "Get Document",
        description: "Return the full text of the active editor.",
        inputSchema: {}
      },
      async () => {
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) {
          throw new Error("No active text editor");
        }

        const fullText = editor.getText();
        return {
          content: [
            {
              type: "text",
              text: fullText
            }
          ]
        };
      }
    );

    server.registerTool(
      "get-line-count",
      {
        title: "Get Line Count",
        description: "Return the total number of lines in the active editor.",
        inputSchema: {}
      },
      async () => {
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) throw new Error("No active editor");
        // buffer.getLineCount() gives you the number of lines
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

    // 2) Get current tab’s filename
    server.registerTool(
      "get-filename",
      {
        title: "Get Filename",
        description: "Return the filename of the active editor (or [untitled] if none).",
        inputSchema: {}
      },
      async () => {
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

    server.registerTool(
      "get-full-path",
      {
        title: "Get Full File Path",
        description: "Return the full absolute path of the active editor.",
        inputSchema: {}
      },
      async () => {
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

    server.registerTool(
      "get-project-files",
      {
        title: "Get Project Files",
        description: "Return a newline-separated list of all files under the current project roots.",
        inputSchema: {}
      },
      async () => {
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

    server.registerTool(
      "open-file",
      {
        title: "Open File",
        description: "Open (or switch to) a tab for the given file path.",
        inputSchema: { filePath: z.string() }
      },
      async ({ filePath }) => {
        await atom.workspace.open(filePath);
        return {
          content: [
            { type: "text", text: `Opened file: ${filePath}` }
          ]
        };
      }
    );

    server.registerTool(
      "show-usage",
      {
        title: "Show Usage Instructions",
        description: "Return a reminder of how to index rows & columns (1-based).",
        inputSchema: {}
      },
      async () => ({
        content: [
          {
            type: "text",
            text:
            "️**Pulsar MCP Server Usage**️\n\n" +
            "- **Row** and **Column** numbers start at **1** (not 0).\n" +
            "- When you call **move-cursor**, pass `row: 5, column: 1` to go to the very first character on line 5.\n" +
            "- For **select-range**, use the same 1-based indexing for `startRow`, `startColumn`, `endRow`, `endColumn`.\n" +
            "- If you need to insert or delete text, use the `insert-text` tool at your current cursor position.\n\n" +
            "Feel free to ask for “help” at any time!"
          }
        ]
      })
    );

}
