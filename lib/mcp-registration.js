'use babel';
import fs from "fs";
import path from "path";
import { z } from "zod";
import { applyPatch } from "diff";

// Register Tools
export function mcpRegistration(server) {

  {
    const curTool = "replace-text";
    console.log("Registering Tool: " + curTool);
    
    server.registerTool(
      curTool,
      {
        title: "Replace Text",
        description: [
          "Search the active editor for `query` and replace it with `replacement`.",
          "`all` controls whether every match is replaced (`true`, default)",
          "or only the first (`false`)."
        ].join(" "),
        inputSchema: {
          query:         z.string(),
          replacement:   z.string(),
          regex:         z.boolean().optional(),        // default false
          caseSensitive: z.boolean().optional(),        // default false
          all:           z.boolean().optional()         // default true
        }
      },
      async ({
        query,
        replacement,
        regex          = false,
        caseSensitive  = false,
        all            = true
      }) => {
        console.log(
          `CMD: ${curTool}, ARGS:`,
          { query, replacement, regex, caseSensitive, all }
        );

        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) throw new Error("No active editor");
        const buffer = editor.getBuffer();

        let source = query;
        if (!regex) {
          source = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        }
        const flags = (all ? "g" : "") + (caseSensitive ? "" : "i");
        const pattern = new RegExp(source, flags);

        const originalText = buffer.getText();
        let matchCount = 0;

        const newText = originalText.replace(pattern, () => {
          matchCount += 1;
          return replacement;
        });

        if (matchCount === 0) {
          return {
            content: [{ type: "text", text: "No matches → nothing replaced." }]
          };
        }

        buffer.setTextViaDiff(newText);

        return {
          content: [
            {
              type: "text",
              text: `Replaced ${matchCount} occurrence${matchCount === 1 ? "" : "s"}.`
            }
          ]
        };
      }
    );
  }

  {
    const curTool = "get-context-around";
    console.log("Registering Tool: " + curTool);

    server.registerTool(
      curTool,
      {
        title: "Get Context Around",
        description: [
          "Return up-to `radiusLines` lines before and after the *N-th* match of",
          "`query` in the active editor. Useful for content-aware edits."
        ].join(" "),
        inputSchema: {
          query:         z.string(),
          regex:         z.boolean().optional(),        // default false
          caseSensitive: z.boolean().optional(),        // default false
          radiusLines:   z.number().optional(),         // default 5
          occurrence:    z.number().optional()          // 1-based, default 1
        }
      },
      async ({
        query,
        regex          = false,
        caseSensitive  = false,
        radiusLines    = 5,
        occurrence     = 1
      }) => {
        console.log(
          `CMD: ${curTool}, ARGS:`,
          { query, regex, caseSensitive, radiusLines, occurrence }
        );

        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) throw new Error("No active editor");

        const buffer     = editor.getBuffer();
        const totalLines = buffer.getLineCount();

        const pattern = regex
        ? new RegExp(query, caseSensitive ? "" : "i")
        : new RegExp(
          query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), // escape
          caseSensitive ? "" : "i"
        );

        const ranges = buffer.findAllSync(pattern);
        if (ranges.length === 0)
        throw new Error("No matches for query.");

        if (occurrence < 1 || occurrence > ranges.length)
        throw new Error(
          `occurrence (${occurrence}) is out of range (1–${ranges.length}).`
        );

        const range        = ranges[occurrence - 1];
        const startRow     = range.start.row;
        const endRow       = range.end.row;
        const contextStart = Math.max(0, startRow - radiusLines);
        const contextEnd   = Math.min(totalLines - 1, endRow + radiusLines);

        const lines = buffer.getTextInRange([
          [contextStart, 0],
          [contextEnd,   buffer.lineLengthForRow(contextEnd)]
        ]).split(/\r?\n/);

        const before = lines.slice(0, startRow - contextStart);
        const match  = lines.slice(startRow - contextStart, endRow - contextStart + 1);
        const after  = lines.slice(endRow - contextStart + 1);

        const payload = {
          before,
          match,
          after,
          matchStartLine: startRow + 1,  // convert to 1-based
          matchEndLine:   endRow   + 1
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(payload, null, 2)
            }
          ]
        };
      }
    );
  }


  {
    const curTool = "find-text";
    console.log("Registering Tool: " + curTool);

    server.registerTool(
      curTool,
      {
        title: "Find Text",
        description: [
          "Search the active editor for a substring or regular expression and",
          "return the positions of each occurrence (up to `maxMatches`)."
        ].join(" "),
        inputSchema: {
          query:        z.string(),
          regex:        z.boolean().optional(),        // default false
          caseSensitive:z.boolean().optional(),        // default false
          maxMatches:   z.number().optional()          // default 50
        }
      },
      async ({
        query,
        regex        = false,
        caseSensitive= false,
        maxMatches   = 50
      }) => {
        console.log(
          `CMD: ${curTool}, ARGS:`,
          { query, regex, caseSensitive, maxMatches }
        );

        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) throw new Error("No active editor");

        const buffer = editor.getBuffer();

        const pattern = regex
        ? new RegExp(query, caseSensitive ? "" : "i")
        : new RegExp(
          query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          caseSensitive ? "" : "i"
        );

        const ranges =
        buffer.findAllSync(pattern, { limit: maxMatches }) || [];

        if (ranges.length === 0) {
          return {
            content: [{ type: "text", text: "No matches." }]
          };
        }

        const results = ranges.map(r => ({
          startLine: r.start.row + 1,
          startCol:  r.start.column + 1,
          endLine:   r.end.row + 1,
          endCol:    r.end.column + 1
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }
    );
  }

  {
    const curTool = "apply-patch";
    console.log("Registering Tool: " + curTool);

    server.registerTool(
      curTool,
      {
        title: "Apply Patch",
        description: [
          "Apply a unified-diff or Git-style patch to the active editor.",
          "The `patch` string **must** include at least one `@@` hunk header."
        ].join(" "),
        inputSchema: { patch: z.string() }
      },
      async ({ patch }) => {
        console.log(`CMD: ${curTool}, ARGS: { patch: /*${patch.length} chars*/ }`);

        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) throw new Error("No active editor");

        const buffer   = editor.getBuffer();
        const original = buffer.getText();

        // Try to apply the diff
        const updated = applyPatch(original, patch, { fuzzFactor: 2 });
        if (updated === false) {
          throw new Error("Patch could not be applied. Check hunk context.");
        }

        if (updated === original) {
          return {
            content: [
              { type: "text", text: "Patch applied, but no changes detected." }
            ]
          };
        }

        // Replace entire buffer atomically
        buffer.setTextViaDiff(updated);

        return {
          content: [
            { type: "text", text: "Patch applied successfully." }
          ]
        };
      }
    );
  }

  {
    const curTool = "insert-line";
    console.log("Registering Tool: " + curTool);
    server.registerTool(curTool,
      {
        title: "Insert Line",
        description: "Insert the given text as a new line at the specified 1-based line number, shifting existing lines down.",
        inputSchema: { lineNumber: z.number(), text: z.string() }
      },
      async (args) => {
        console.log("CMD: " + curTool + ", ARGS: " + JSON.stringify(args));
        const { lineNumber, text } = args;
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) throw new Error("No active editor");

        const buffer = editor.getBuffer();
        const totalLines = buffer.getLineCount();

        if (lineNumber < 1 || lineNumber > totalLines + 1) {
          throw new Error(`lineNumber ${lineNumber} is out of range (1–${totalLines + 1})`);
        }

        const rowIndex = lineNumber - 1;  // convert to 0-based
        editor.setCursorBufferPosition([rowIndex, 0]);
        editor.insertText(text + "\n");

        return {
          content: [
            {
              type: "text",
              text: `Inserted line at ${lineNumber}: "${text}"`
            }
          ]
        };
      }
    );
  }

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
