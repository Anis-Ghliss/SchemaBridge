import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { Check, Sparkles, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { cn } from "../lib/utils";

interface Props {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly minHeight?: string;
  readonly maxHeight?: string;
  readonly placeholder?: string;
  readonly label?: string;
  readonly hideHeader?: boolean;
  readonly ariaLabel?: string;
}

export function JsonEditor({ value, onChange, minHeight = "160px", maxHeight = "320px", placeholder, label, hideHeader, ariaLabel }: Props) {
  const validity = useMemo(() => checkValidity(value), [value]);

  const extensions = useMemo(() => [
    json(),
    linter(jsonParseLinter()),
    EditorView.lineWrapping,
    EditorView.theme({
      "&": { backgroundColor: "transparent" },
      ".cm-content": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12px", padding: "12px 0" },
      ".cm-gutters": { backgroundColor: "hsl(210 40% 98%)", borderRight: "1px solid hsl(214 32% 91%)", color: "hsl(215 16% 65%)" },
      ".cm-activeLineGutter": { backgroundColor: "hsl(210 40% 95%)" },
      ".cm-activeLine": { backgroundColor: "hsl(210 40% 98%)" },
      ".cm-focused": { outline: "none" }
    })
  ], []);

  function format() {
    const parsed = safeParse(value);
    if (parsed.ok) onChange(JSON.stringify(parsed.value, null, 2));
  }

  return (
    <div className={cn("overflow-hidden rounded-md border", validity.ok ? "border-border" : "border-rose-300/70 ring-1 ring-rose-100")}>
      {!hideHeader && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="font-medium uppercase tracking-wide">{label ?? "JSON"}</span>
            {validity.ok ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                <Check className="h-3 w-3" /> Valid
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                <TriangleAlert className="h-3 w-3" /> {validity.error}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={!validity.ok}
            onClick={format}
            className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-3 w-3" /> Format
          </button>
        </div>
      )}
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        basicSetup={{ lineNumbers: true, highlightActiveLine: true, foldGutter: true, dropCursor: true, indentOnInput: true, autocompletion: false, bracketMatching: true, closeBrackets: true }}
        placeholder={placeholder}
        minHeight={minHeight}
        maxHeight={maxHeight}
        aria-label={ariaLabel ?? label}
      />
    </div>
  );
}

function checkValidity(text: string): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, error: "Empty" };
  try {
    JSON.parse(trimmed);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    return { ok: false, error: message.replace(/^JSON.parse:\s*/, "").slice(0, 60) };
  }
}

function safeParse(text: string): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}
