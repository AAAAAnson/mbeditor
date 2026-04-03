import Editor from "@monaco-editor/react";

interface MonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: string;
  height?: string;
}

export default function MonacoEditor({ value, onChange, language, height = "100%" }: MonacoEditorProps) {
  return (
    <Editor
      height={height}
      language={language}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        fontFamily: "var(--font-mono)",
        lineNumbers: "on",
        wordWrap: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        padding: { top: 12 },
      }}
    />
  );
}
