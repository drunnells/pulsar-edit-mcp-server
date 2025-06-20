'use babel';
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
        description: "Return the text currently selected in the active editor."
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
        description: "Return the full text of the active editor."
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
      "show-usage",
      {
        title: "Show Usage Instructions",
        description: "Return a reminder of how to index rows & columns (1-based)."
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
