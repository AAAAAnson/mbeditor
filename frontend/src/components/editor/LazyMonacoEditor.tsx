import {
  forwardRef,
  useEffect,
  useState,
  type ComponentType,
} from "react";
import type { MonacoEditorHandle } from "@/components/editor/MonacoEditor";

interface MonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: string;
  height?: string;
  onPasteImage?: (file: File) => Promise<void> | void;
}

const LazyMonacoEditor = forwardRef<MonacoEditorHandle, MonacoEditorProps>(
  function LazyMonacoEditor(props, ref) {
    const [Component, setComponent] = useState<ComponentType<any> | null>(null);

    useEffect(() => {
      let mounted = true;
      import("@/components/editor/MonacoEditor").then((mod) => {
        if (mounted) {
          setComponent(() => mod.default as ComponentType<any>);
        }
      });
      return () => {
        mounted = false;
      };
    }, []);

    if (!Component) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-fg-muted">
          正在加载编辑器...
        </div>
      );
    }

    return <Component ref={ref} {...props} />;
  },
);

export default LazyMonacoEditor;
