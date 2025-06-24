'use babel';
import fs from "fs";
import path from "path";
import { z } from "zod";
import { applyPatch, diffLines } from "diff";
import { CompositeDisposable, Disposable } from "atom";

const packageDisposables = new CompositeDisposable();
const activeHighlightSets = [];

function decorateEditedLines(editor, original, updated, { ttl = 8000 } = {}) {
  // fresh container so this set lives (and dies) independently
  const disp = new CompositeDisposable();
  activeHighlightSets.push(disp);
  packageDisposables.add(disp);

  const hunks = diffLines(original, updated);
  let newRow = 0;

  hunks.forEach(h => {
    const lineCount = h.count ?? h.value.split(/\r?\n/).length - 1;

    if (h.added || h.removed) {
      const startRow = newRow;
      const endRow   = newRow + (h.added ? lineCount - 1 : 0);

      if (h.added) {
        addDecoration(editor, disp, startRow, endRow, "mcp-diff-added");
      } else if (h.removed) {
        addDecoration(editor, disp, startRow, startRow, "mcp-diff-removed");
      }
    }

    if (!h.removed) newRow += lineCount;
  });

  // nuke this batch on the next buffer change…
  disp.add(editor.getBuffer().onDidChange(() => disp.dispose()));

  // …or after a short TTL so the gutter doesn’t fill up forever.
  if (ttl > 0) {
    const timer = setTimeout(() => disp.dispose(), ttl);
    disp.add(new Disposable(() => clearTimeout(timer)));
  }

  // self-remove from registry
  disp.add(new Disposable(() => {
    const idx = activeHighlightSets.indexOf(disp);
    if (idx !== -1) activeHighlightSets.splice(idx, 1);
  }));

  return disp;
}

function decorateLine(editor, row, kind = "added", opts = {}) {
  const disp = new CompositeDisposable();
  const klass = kind === "removed" ? "mcp-diff-removed" : "mcp-diff-added";
  addDecoration(editor, disp, row, row, klass);

  // copy the TTL logic from decorateEditedLines
  const { ttl = 8000 } = opts;
  if (ttl > 0) {
    const timer = setTimeout(() => disp.dispose(), ttl);
    disp.add(new Disposable(() => clearTimeout(timer)));
  }
  return disp;
}

function addDecoration(editor, disp, fromRow, toRow, klass) {
  const marker = editor.getBuffer().markRange(
    [[fromRow, 0], [toRow, Infinity]],
    { invalidate: "never" }
  );
  disp.add(new Disposable(() => marker.destroy()));

  const decoLine = editor.decorateMarker(
    marker,
    { type: "line", class: klass }
  );
  const decoGut  = editor.decorateMarker(
    marker,
    { type: "gutter", gutterName: "line-number", class: `${klass}-gutter` }
  );

  disp.add(new Disposable(() => decoLine.destroy()));
  disp.add(new Disposable(() => decoGut.destroy()));
}

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
          "`all` controls whether every match is replaced or only the first (`false` by default).",
          "Workflow hint: Call `get-document` first for freshest text."
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
        all            = false
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

        decorateEditedLines(editor, originalText, newText);

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
          "`query` in the active editor. Useful for content-aware edits.",
          "Workflow hint: Call `get-document` first for freshest text.",
          "Use larger `radiusLines` for code blocks for better context understanding."
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
    const curTool = "replace-document";
    console.log("Registering Tool: " + curTool);

    server.registerTool(
      curTool,
      {
        title: "Replace Document",
        description: [
          "Replace the entire contents of the editor with rewritten text.",
          "Useful for large edits. Do not include document line numbers that didn't exist before the edit.",
          "Try to maintain surrounding text where possible.",
          "Workflow hint: ALWAYS call `get-document` first for most up to date context."
        ].join(" "),
        inputSchema: { text: z.string() }
      },
      async ({ text }) => {
        console.log(`CMD: ${curTool}, ARGS: { text: /*${text.length} chars*/ }`);

        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) throw new Error("No active editor");

        const buffer   = editor.getBuffer();
        const original = buffer.getText();

        if (text === original) {
          return {
            content: [{ type: "text", text: "No changes → document identical." }]
          };
        }

        // atomically replace & decorate
        buffer.setTextViaDiff(text);
        decorateEditedLines(editor, original, text);

        return {
          content: [{ type: "text", text: "Document replaced successfully." }]
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
        description: "Insert the given text as a new line at the specified 1-based line number, shifting existing lines down. Prefer replace-document for large edits.",
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
        decorateLine(editor, rowIndex, "added");

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
        description: "Delete the specified line number (1-based). Prefer replace-document for large edits.",
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
        decorateLine(editor, rowIndex, "removed");

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
        description: "Delete all lines from startLine to endLine (inclusive). For a single line, set startLine === endLine. Line numbers are 1-based. Prefer replace-document for large edits. Consider doing a get-document to confirm range is possible.",
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
          decorateLine(editor, row, "removed");
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

    server.registerTool(
      curTool,
      {
        title: "Get Document (JSON)",
        description: [
          "Return an array of lines with their 1-based line numbers.",
          "Example: { lines: [{ n: 1, text: \"const x = 1;\" }, ...] }",
          "Use get-raw-document when considering contents and changes to avoid accidentaly including line number prefixes."
        ].join(" "),
        inputSchema: {}
      },
      async () => {
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) throw new Error("No active editor");

        const rawLines = editor.getText().split(/\r?\n/);
        const payload  = {
          lineCount: rawLines.length,
          lines: rawLines.map((t, i) => ({ n: i + 1, text: t }))
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
    const curTool = "get-raw-document";
    server.registerTool(
      curTool,
      {
        title: "Get Document",
        description: "Return the full text of the active editor with *no* added line numbers. Use get-document when attempting to determine the precise line of text.",
        inputSchema: {}
      },
      async () => {
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) throw new Error("No active editor");
        return { content: [{ type: "text", text: editor.getText() }] };
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

  {
    const curTool = "undo";
    console.log("Registering Tool: " + curTool);

    server.registerTool(
      curTool,
      {
        title: "Undo",
        description: "Undo the last change in the active editor.",
        inputSchema: {}
      },
      async (args) => {
        console.log(`CMD: ${curTool}, ARGS: ${JSON.stringify(args)}`);

        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) throw new Error("No active editor");

        const buffer   = editor.getBuffer();
        const before   = buffer.getText();

        editor.undo();                       // built-in

        const after    = buffer.getText();
        const changed  = before !== after;

        return {
          content: [
            {
              type: "text",
              text: changed ? "Undo completed." : "Nothing to undo."
            }
          ]
        };
      }
    );
  }

  {
    const curTool = "redo";
    console.log("Registering Tool: " + curTool);

    server.registerTool(
      curTool,
      {
        title: "Redo",
        description: "Redo the last undone change in the active editor.",
        inputSchema: {}
      },
      async (args) => {
        console.log(`CMD: ${curTool}, ARGS: ${JSON.stringify(args)}`);

        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) throw new Error("No active editor");

        const buffer   = editor.getBuffer();
        const before   = buffer.getText();

        editor.redo();                       // built-in

        const after    = buffer.getText();
        const changed  = before !== after;

        return {
          content: [
            {
              type: "text",
              text: changed ? "Redo completed." : "Nothing to redo."
            }
          ]
        };
      }
    );
  }

}
