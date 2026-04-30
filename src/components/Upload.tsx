"use client";

import React from "react";

type Props = {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  acceptedTypes?: string;
};

export default function Upload({ onFileSelected, disabled = false, acceptedTypes = "image/*,application/pdf,.heic,.heif" }: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  function pickFirstFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    onFileSelected(file);
  }

  function handleDrop(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;
    pickFirstFile(e.dataTransfer.files);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={acceptedTypes}
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          pickFirstFile(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex min-h-48 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
          isDragging
            ? "border-emerald-500 bg-emerald-50"
            : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-white"
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className="text-base font-semibold text-slate-950">Drop a file here</span>
        <span className="mt-2 text-sm text-slate-500">or click to choose an image / PDF</span>
      </button>
    </>
  );
}
