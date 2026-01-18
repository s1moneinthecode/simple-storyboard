import React, { useEffect, useRef, useState } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

/* ===================== TYPES ===================== */
type Chapter = {
  id: string;
  title: string;
  html: string;
  createdAt: number;
  updatedAt: number;
};

/* ===================== STORAGE ===================== */
const LS_KEY = "chapter_cards_v3";
const LS_BACKUP_KEY = "chapter_cards_v3_backup";

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/* ===================== UTIL ===================== */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function stripHtml(html: string) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || "";
}

/* ===================== EXPORT ===================== */
function compileMarkdown(chapters: Chapter[]) {
  return chapters
    .map(
      (c, i) =>
        `# ${c.title || `Chapter ${i + 1}`}\n\n${stripHtml(c.html)}`
    )
    .join("\n\n");
}

function compilePlainText(chapters: Chapter[]) {
  return chapters
    .map(
      (c, i) =>
        `${c.title || `Chapter ${i + 1}`}\n\n${stripHtml(c.html)}`
    )
    .join("\n\n\n");
}

async function exportAsDocx(chapters: Chapter[], filename: string) {
  const docx = await import("docx");
  const { saveAs } = await import("file-saver");
  const { Document, Paragraph, HeadingLevel, Packer } = docx;

  const children: any[] = [];

  chapters.forEach((c, i) => {
    children.push(
      new Paragraph({
        text: c.title || `Chapter ${i + 1}`,
        heading: HeadingLevel.HEADING_1,
      })
    );

    stripHtml(c.html)
      .split("\n")
      .forEach((line) => children.push(new Paragraph(line)));
  });

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${filename}.docx`);
}

/* ===================== DOCX IMPORT (Custom Parser) ===================== */
async function parseDocxToHtml(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  
  if (!documentXml) {
    throw new Error("Could not find document.xml in DOCX file");
  }
  
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(documentXml, "application/xml");
  
  // Get all paragraphs
  const paragraphs = xmlDoc.getElementsByTagNameNS(
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "p"
  );
  
  let html = "";
  
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const { text: paraHtml, alignment, isHeading, firstLineIndent } = parseParagraph(para);
    
    if (isHeading) {
      html += `<h1>${paraHtml}</h1>`;
    } else {
      // Build class list for alignment
      let classAttr = "";
      if (alignment === "center") classAttr = ' class="ql-align-center"';
      else if (alignment === "right") classAttr = ' class="ql-align-right"';
      else if (alignment === "both" || alignment === "justify") classAttr = ' class="ql-align-justify"';
      
      // Add first-line indent as non-breaking spaces at the start
      let content = paraHtml;
      if (firstLineIndent > 0 && paraHtml.trim().length > 0) {
        // Use a tab-like indent (4 non-breaking spaces)
        content = "&nbsp;&nbsp;&nbsp;&nbsp;" + paraHtml;
      }
      
      html += `<p${classAttr}>${content || "<br>"}</p>`;
    }
  }
  
  return html;
}

function parseParagraph(para: Element): { 
  text: string; 
  alignment: string; 
  isHeading: boolean;
  firstLineIndent: number;
} {
  const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  
  // Get paragraph properties
  const pPr = para.getElementsByTagNameNS(W_NS, "pPr")[0];
  
  // Check alignment
  let alignment = "left";
  if (pPr) {
    const jc = pPr.getElementsByTagNameNS(W_NS, "jc")[0];
    if (jc) {
      alignment = jc.getAttribute("w:val") || "left";
    }
  }
  
  // Check for first-line indent
  let firstLineIndent = 0;
  if (pPr) {
    const ind = pPr.getElementsByTagNameNS(W_NS, "ind")[0];
    if (ind) {
      const firstLine = ind.getAttribute("w:firstLine");
      if (firstLine) {
        firstLineIndent = parseInt(firstLine, 10) || 0;
      }
    }
  }
  
  // Check for heading style
  let isHeading = false;
  if (pPr) {
    const pStyle = pPr.getElementsByTagNameNS(W_NS, "pStyle")[0];
    if (pStyle) {
      const styleVal = pStyle.getAttribute("w:val") || "";
      if (styleVal.toLowerCase().includes("heading")) {
        isHeading = true;
      }
    }
  }
  
  // Get all runs
  const runs = para.getElementsByTagNameNS(W_NS, "r");
  let text = "";
  
  for (let j = 0; j < runs.length; j++) {
    text += parseRun(runs[j]);
  }
  
  return { text, alignment, isHeading, firstLineIndent };
}

function parseRun(run: Element): string {
  const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  
  // Get run properties for formatting
  const rPr = run.getElementsByTagNameNS(W_NS, "rPr")[0];
  
  let isBold = false;
  let isItalic = false;
  let isUnderline = false;
  let isStrike = false;
  
  if (rPr) {
    // Check bold
    const bold = rPr.getElementsByTagNameNS(W_NS, "b")[0];
    if (bold && bold.getAttribute("w:val") !== "0") {
      isBold = true;
    }
    
    // Check italic
    const italic = rPr.getElementsByTagNameNS(W_NS, "i")[0];
    if (italic && italic.getAttribute("w:val") !== "0") {
      isItalic = true;
    }
    
    // Check underline
    const underline = rPr.getElementsByTagNameNS(W_NS, "u")[0];
    if (underline && underline.getAttribute("w:val") !== "none") {
      isUnderline = true;
    }
    
    // Check strikethrough
    const strike = rPr.getElementsByTagNameNS(W_NS, "strike")[0];
    if (strike && strike.getAttribute("w:val") !== "0") {
      isStrike = true;
    }
  }
  
  // Process child nodes in order to preserve tabs, text, and breaks
  let content = "";
  const childNodes = run.childNodes;
  
  for (let i = 0; i < childNodes.length; i++) {
    const node = childNodes[i];
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const localName = element.localName;
      
      if (localName === "t") {
        // Text node
        content += element.textContent || "";
      } else if (localName === "tab") {
        // Tab character - use non-breaking spaces
        content += "&nbsp;&nbsp;&nbsp;&nbsp;";
      } else if (localName === "br") {
        // Line break
        content += "<br>";
      }
    }
  }
  
  // Apply formatting
  if (content) {
    if (isBold) content = `<strong>${content}</strong>`;
    if (isItalic) content = `<em>${content}</em>`;
    if (isUnderline) content = `<u>${content}</u>`;
    if (isStrike) content = `<s>${content}</s>`;
  }
  
  return content;
}

/* ===================== QUILL CONFIG ===================== */
const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ align: [] }], // Alignment options: left, center, right, justify
    [{ list: "ordered" }, { list: "bullet" }],
    ["link"],
    ["clean"],
  ],
};

const quillFormats = [
  "header",
  "bold",
  "italic",
  "underline",
  "strike",
  "align",
  "list",
  "bullet",
  "link",
];

/* ===================== APP ===================== */
export default function App() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [search, setSearch] = useState("");

  const importRef = useRef<HTMLInputElement>(null);
  const docxRef = useRef<HTMLInputElement>(null);

  /* ---------- LOAD ---------- */
  useEffect(() => {
    const raw =
      localStorage.getItem(LS_KEY) ||
      localStorage.getItem(LS_BACKUP_KEY);

    if (raw) {
      setChapters(JSON.parse(raw));
    } else {
      setChapters([
        {
          id: uid(),
          title: "Chapter 1",
          html: "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);
    }
  }, []);

  /* ---------- SAVE ---------- */
  useEffect(() => {
    if (!chapters.length) return;
    localStorage.setItem(LS_KEY, JSON.stringify(chapters));
    localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(chapters));
  }, [chapters]);

  const active = chapters.find((c) => c.id === activeId) || null;

  const filtered = chapters.filter((c) =>
    (c.title + stripHtml(c.html))
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  function updateActive(patch: Partial<Chapter>) {
    if (!active) return;
    setChapters((prev) =>
      prev.map((c) =>
        c.id === active.id
          ? { ...c, ...patch, updatedAt: Date.now() }
          : c
      )
    );
  }

  function deleteChapter(id: string) {
    if (!confirm("Are you sure you want to delete this chapter?")) return;
    setChapters((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setEditorOpen(false);
    }
  }

  /* ---------- DOCX IMPORT HANDLER ---------- */
  async function handleDocxImport(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newChapters: Chapter[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const html = await parseDocxToHtml(file);
        const title = file.name.replace(/\.docx$/i, "");
        newChapters.push({
          id: uid(),
          title,
          html,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      } catch (err) {
        console.error(`Failed to parse ${file.name}:`, err);
        alert(`Failed to import ${file.name}`);
      }
    }

    if (newChapters.length > 0) {
      setChapters((prev) => [...prev, ...newChapters]);
    }

    // Reset the input
    e.target.value = "";
  }

  return (
    <div
      className="min-h-screen text-neutral-100"
      style={{
        backgroundImage: "url(/src/assets/woodgrain.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Simple Storyboard</h1>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                setChapters((p) => [
                  ...p,
                  {
                    id: uid(),
                    title: `Chapter ${p.length + 1}`,
                    html: "",
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  },
                ])
              }
              className="rounded-xl bg-neutral-100 px-4 py-2 text-neutral-950"
            >
              Add chapter
            </button>

            <button onClick={() => exportAsDocx(chapters, "Novel")}>
              Export DOCX
            </button>

            <button
              onClick={() =>
                downloadBlob(
                  new Blob([compileMarkdown(chapters)]),
                  "Novel.md"
                )
              }
            >
              Export MD
            </button>

            <button
              onClick={() =>
                downloadBlob(
                  new Blob([compilePlainText(chapters)]),
                  "Novel.txt"
                )
              }
            >
              Export TXT
            </button>

            <button onClick={() => importRef.current?.click()}>
              Import JSON
            </button>

            <button onClick={() => docxRef.current?.click()}>
              Import DOCX
            </button>
          </div>
        </header>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="mb-4 w-full rounded-xl bg-neutral-900/90 px-4 py-3"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c, i) => (
            <div key={c.id} className="relative">
              <button
                onClick={() => {
                  setActiveId(c.id);
                  setEditorOpen(true);
                }}
                className="w-full rounded-2xl bg-neutral-900/90 p-4 text-left"
              >
                <div className="font-semibold">
                  {c.title || `Chapter ${i + 1}`}
                </div>
                <div className="mt-2 text-sm text-neutral-400 line-clamp-4">
                  {stripHtml(c.html) || "Click to write…"}
                </div>
              </button>
              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChapter(c.id);
                }}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-neutral-700 hover:bg-red-600 text-neutral-300 hover:text-white flex items-center justify-center text-sm"
                title="Delete chapter"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {editorOpen && active && (
        <div className="fixed inset-0 z-50 bg-black/70 p-4 overflow-auto">
          <div className="mx-auto max-w-4xl rounded-3xl bg-neutral-950 p-6">
            <input
              value={active.title}
              onChange={(e) => updateActive({ title: e.target.value })}
              className="mb-3 w-full rounded-xl bg-neutral-900 px-4 py-2"
            />

            <div className="quill-wrapper h-[60vh] flex flex-col">
              <ReactQuill
                theme="snow"
                value={active.html}
                onChange={(v) => updateActive({ html: v })}
                modules={quillModules}
                formats={quillFormats}
                className="flex-1 bg-white text-black overflow-hidden flex flex-col"
              />
            </div>

            <div className="mt-4 flex justify-between">
              <button
                onClick={() => deleteChapter(active.id)}
                className="rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2 text-white"
              >
                Delete chapter
              </button>
              <button
                onClick={() => setEditorOpen(false)}
                className="rounded-xl bg-neutral-100 px-4 py-2 text-neutral-950"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={importRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () =>
            setChapters(JSON.parse(String(r.result)));
          r.readAsText(f);
        }}
      />

      <input
        ref={docxRef}
        type="file"
        accept=".docx"
        multiple
        className="hidden"
        onChange={handleDocxImport}
      />

      <style>{`
        .quill-wrapper .ql-container {
          flex: 1;
          overflow: auto;
        }
        .quill-wrapper .ql-editor {
          min-height: 100%;
        }
      `}</style>
    </div>
  );
}
