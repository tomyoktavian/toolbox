'use client'
import React, { useState, useEffect, useRef } from 'react'
import Editor, { EditorProps } from "@monaco-editor/react";
import "./code-editor.css"

interface CodeEditorProps
  extends Omit<
    EditorProps,
    "language" | "value" | "defaultValue" | "onChange" | "height"
  > {
  height?: string;
  value?: string;
  defaultValue?: string;
  language?: string;
  readOnly?: boolean;
  placeholder?: string;
  onChange?: (value: string) => void;
};

const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  defaultValue = "",
  language = "json",
  height = "80vh",
  onChange,
  readOnly = false,
  placeholder = "// Paste your JSON here...\n// Write anything here ...",
  ...props
}) => {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const [code, setCode] = useState(value || defaultValue);

  useEffect(() => {
    setCode(value || defaultValue);
  }, [defaultValue, value]);

  const handleCodeChange = (newValue: string = "", ev?: any) => {
    setCode(newValue);
    if (onChange) {
      onChange(newValue);
    }
    
    // Menampilkan atau menyembunyikan placeholder berdasarkan konten editor
    if (placeholderRef.current) {
      placeholderRef.current.style.display = newValue ? 'none' : 'block';
    }
  };

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    
    setTimeout(() => {
      editor?.getAction("editor.action.formatDocument")?.run();
    }, 300);
    
    // Menampilkan placeholder jika editor kosong saat dimuat
    if (placeholderRef.current) {
      placeholderRef.current.style.display = code ? 'none' : 'block';
    }
  };

  useEffect(() => {
    // Mengatur tinggi editor berdasarkan container parent
    const resizeObserver = new ResizeObserver(() => {
      if (editorContainerRef.current) {
        editorContainerRef.current.style.height = "100%";
      }
    });

    const currentRef = editorContainerRef.current;
    if (currentRef) {
      resizeObserver.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        resizeObserver.unobserve(currentRef);
      }
    };
  }, []);

  return (
    <div
      ref={editorContainerRef}
      className="editor-container"
      style={{ height: "100%", minHeight: "300px", position: "relative" }}
    >
      <Editor
        theme="vs-dark"
        {...props}
        defaultValue={defaultValue}
        language={language}
        value={code}
        onChange={handleCodeChange}
        onMount={handleEditorMount}
        height="100%"
        options={{
          readOnly,
          folding: true,
          foldingStrategy: 'auto',
          showFoldingControls: 'always',
          foldingHighlight: true,
          minimap: {
            enabled: true,
            showSlider: "always",
            renderCharacters: true,
            maxColumn: 120,
            scale: 1
          },
        }}
      />
      <div ref={placeholderRef} className="monaco-placeholder">{placeholder}</div>
    </div>
  );
};

export default CodeEditor
