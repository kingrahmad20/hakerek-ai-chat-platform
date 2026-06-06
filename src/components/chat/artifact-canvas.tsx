"use client";

import { useMemo, useState, useEffect } from "react";
import { X, Copy, Check, Download, Code2, Eye, FileCode2, Braces, FileText, Image as ImageIcon, RefreshCw } from "lucide-react";
import type { Artifact, ArtifactKind } from "@/lib/artifacts";
import { renderMarkdown } from "@/lib/markdown";

interface ArtifactCanvasProps {
    artifact: Artifact;
    artifacts?: Artifact[];          // for prev/next navigation within a message
    onSelect?: (artifact: Artifact) => void;
    onClose: () => void;
}

const PREVIEWABLE: ArtifactKind[] = ["html", "svg", "react", "markdown"];

const EXTENSION: Record<string, string> = {
    html: "html", htm: "html", svg: "svg", jsx: "jsx", tsx: "tsx",
    react: "jsx", markdown: "md", md: "md", js: "js", ts: "ts",
    python: "py", py: "py", css: "css", json: "json", bash: "sh",
    sh: "sh", sql: "sql", go: "go", rust: "rs", java: "java", yaml: "yaml",
};

function kindIcon(kind: ArtifactKind) {
    switch (kind) {
        case "html": return <FileCode2 size={13} />;
        case "svg": return <ImageIcon size={13} />;
        case "react": return <Braces size={13} />;
        case "markdown": return <FileText size={13} />;
        default: return <Code2 size={13} />;
    }
}

// Strip module syntax (no bundler in the iframe) and surface a render target.
function prepareReactCode(code: string): string {
    return code
        .replace(/^\s*import\s+[^\n;]+;?\s*$/gm, "")          // drop import lines
        .replace(/export\s+default\s+function/g, "function")
        .replace(/export\s+default\s+class/g, "class")
        .replace(/export\s+default\s+/g, "window.__default = ")
        .replace(/export\s+(const|let|var|function|class)/g, "$1");
}

function buildReactDoc(code: string): string {
    const prepared = prepareReactCode(code);
    return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<style>
  html,body{margin:0;padding:0;background:#fff;color:#111;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  #root{padding:16px}
  #__err{white-space:pre-wrap;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;padding:12px;margin:12px;border-radius:8px;font-family:ui-monospace,Menlo,monospace;font-size:12px;display:none}
</style></head><body>
<div id="root"></div>
<pre id="__err"></pre>
<script src="/artifacts/react.production.min.js"></script>
<script src="/artifacts/react-dom.production.min.js"></script>
<script src="/artifacts/babel.min.js"></script>
<script>
  window.addEventListener("error", function(e){
    var el = document.getElementById("__err");
    el.style.display = "block";
    el.textContent = String(e.message || e.error || e);
  });
</script>
<script type="text/babel" data-presets="react,typescript">
  const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, useLayoutEffect, Fragment } = React;
  window.__default = undefined;
  try {
    ${prepared}
    const __target =
      (typeof App !== "undefined" && App) ||
      window.__default ||
      null;
    if (!__target) throw new Error("No component found. Define a component named App or use 'export default'.");
    const __root = ReactDOM.createRoot(document.getElementById("root"));
    __root.render(React.createElement(__target));
  } catch (err) {
    const el = document.getElementById("__err");
    el.style.display = "block";
    el.textContent = String(err && err.stack || err);
  }
</script>
</body></html>`;
}

function buildHtmlDoc(code: string): string {
    const isFullDoc = /<html[\s>]/i.test(code) || /<!doctype/i.test(code);
    if (isFullDoc) return code;
    return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<style>html,body{margin:0;padding:16px;background:#fff;color:#111;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}</style>
</head><body>${code}</body></html>`;
}

function buildSvgDoc(code: string): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<style>html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#fff;
  background-image:linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%);
  background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}
  svg{max-width:90%;max-height:90%}</style></head><body>${code}</body></html>`;
}

function CodeView({ code }: { code: string }) {
    const lines = code.split("\n");
    return (
        <div className="h-full overflow-auto bg-gray-950 text-sm">
            <table className="w-full border-collapse font-mono">
                <tbody>
                    {lines.map((line, i) => (
                        <tr key={i} className="hover:bg-gray-900/50">
                            <td className="select-none text-right pr-3 pl-3 text-gray-600 w-px align-top tabular-nums border-r border-gray-800">
                                {i + 1}
                            </td>
                            <td className="pl-4 pr-4 text-gray-200 whitespace-pre align-top">
                                {line || " "}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function ArtifactCanvas({ artifact, artifacts = [], onSelect, onClose }: ArtifactCanvasProps) {
    const canPreview = PREVIEWABLE.includes(artifact.kind);
    const [mode, setMode] = useState<"preview" | "code">(canPreview ? "preview" : "code");
    const [copied, setCopied] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    // Reset view when switching artifacts.
    useEffect(() => {
        setMode(PREVIEWABLE.includes(artifact.kind) ? "preview" : "code");
    }, [artifact.id, artifact.kind]);

    const srcDoc = useMemo(() => {
        switch (artifact.kind) {
            case "react": return buildReactDoc(artifact.code);
            case "html": return buildHtmlDoc(artifact.code);
            case "svg": return buildSvgDoc(artifact.code);
            default: return "";
        }
    }, [artifact.kind, artifact.code]);

    const markdownHtml = useMemo(
        () => (artifact.kind === "markdown" ? renderMarkdown(artifact.code) : ""),
        [artifact.kind, artifact.code]
    );

    const handleCopy = async () => {
        await navigator.clipboard.writeText(artifact.code).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const ext = EXTENSION[artifact.language] ?? EXTENSION[artifact.kind] ?? "txt";
        const safeName = artifact.title.replace(/[^a-z0-9.\-_]+/gi, "-").replace(/^-+|-+$/g, "") || "artifact";
        const name = /\.[a-z0-9]+$/i.test(safeName) ? safeName : `${safeName}.${ext}`;
        const blob = new Blob([artifact.code], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-gray-900 md:relative md:inset-auto md:z-auto w-full md:w-[30rem] lg:w-[40rem] xl:w-[46rem] shrink-0 border-l border-gray-700">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-700 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-gray-800 text-gray-300 border border-gray-700 shrink-0">
                        {kindIcon(artifact.kind)}
                    </span>
                    <span className="text-sm font-medium text-white truncate">{artifact.title}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    {canPreview && (
                        <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg p-0.5 mr-1">
                            <button
                                onClick={() => setMode("preview")}
                                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${mode === "preview" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}
                            >
                                <Eye size={12} /> Preview
                            </button>
                            <button
                                onClick={() => setMode("code")}
                                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${mode === "code" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}
                            >
                                <Code2 size={12} /> Code
                            </button>
                        </div>
                    )}
                    {canPreview && mode === "preview" && artifact.kind !== "markdown" && (
                        <button
                            onClick={() => setReloadKey((k) => k + 1)}
                            title="Reload preview"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                        >
                            <RefreshCw size={14} />
                        </button>
                    )}
                    <button
                        onClick={handleCopy}
                        title="Copy code"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                    >
                        {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                    </button>
                    <button
                        onClick={handleDownload}
                        title="Download"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                    >
                        <Download size={14} />
                    </button>
                    <button
                        onClick={onClose}
                        title="Close canvas"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0">
                {mode === "code" || !canPreview ? (
                    <CodeView code={artifact.code} />
                ) : artifact.kind === "markdown" ? (
                    <div
                        className="h-full overflow-auto px-6 py-5 bg-white text-gray-900 artifact-markdown"
                        dangerouslySetInnerHTML={{ __html: markdownHtml }}
                    />
                ) : (
                    <iframe
                        key={`${artifact.id}:${reloadKey}`}
                        title={artifact.title}
                        srcDoc={srcDoc}
                        sandbox="allow-scripts allow-popups allow-forms allow-modals"
                        className="w-full h-full bg-white border-0"
                    />
                )}
            </div>

            {/* Multi-artifact navigation */}
            {artifacts.length > 1 && onSelect && (
                <div className="flex items-center gap-1.5 px-3 py-2 border-t border-gray-700 overflow-x-auto shrink-0">
                    {artifacts.map((a) => (
                        <button
                            key={a.id}
                            onClick={() => onSelect(a)}
                            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors ${a.id === artifact.id ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700"}`}
                        >
                            {kindIcon(a.kind)} {a.title}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
