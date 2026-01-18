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

/* ===================== QUILL STYLES ===================== */
const quillStyles = `
  .quill-wrapper {
    display: flex;
    flex-direction: column;
    height: 60vh;
    border-radius: 0.75rem;
    overflow: hidden;
  }
  .quill-wrapper .quill {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .quill-wrapper .ql-toolbar {
    flex-shrink: 0;
    border-top-left-radius: 0.75rem;
    border-top-right-radius: 0.75rem;
  }
  .quill-wrapper .ql-container {
    flex: 1;
    overflow: auto;
    border-bottom-left-radius: 0.75rem;
    border-bottom-right-radius: 0.75rem;
  }
`;

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

  return (
    <div
      className="min-h-screen text-neutral-100"
      style={{
        backgroundImage: "url(/src/assets/woodgrain.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <style>{quillStyles}</style>
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
            <button
              key={c.id}
              onClick={() => {
                setActiveId(c.id);
                setEditorOpen(true);
              }}
              className="rounded-2xl bg-neutral-900/90 p-4 text-left"
            >
              <div className="font-semibold">
                {c.title || `Chapter ${i + 1}`}
              </div>
              <div className="mt-2 text-sm text-neutral-400 line-clamp-4">
                {stripHtml(c.html) || "Click to write…"}
              </div>
            </button>
          ))}
        </div>
      </div>

      {editorOpen && active && (
        <div className="fixed inset-0 z-50 bg-black/70 p-4">
          <div className="mx-auto max-w-4xl rounded-3xl bg-neutral-950 p-6">
            <input
              value={active.title}
              onChange={(e) => updateActive({ title: e.target.value })}
              className="mb-3 w-full rounded-xl bg-neutral-900 px-4 py-2"
            />

            <div className="quill-wrapper bg-white text-black">
              <ReactQuill
                theme="snow"
                value={active.html}
                onChange={(v) => updateActive({ html: v })}
              />
            </div>

            <div className="mt-4 flex justify-end">
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
      />
    </div>
  );
}