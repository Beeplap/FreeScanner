 "use client";

import React, { useEffect, useRef, useState } from "react";
import { useDocumentStore, ScannedPage } from "../src/store/documentStore";
import { PageSorter } from "../src/components/PageSorter";
import { imagesToPDF } from "../src/utils/pdfUtils";

export default function Home() {
  const pages = useDocumentStore((s) => s.pages);
  const addPage = useDocumentStore((s) => s.addPage);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleAddClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      const id = crypto.randomUUID();
      const page: ScannedPage = {
        id,
        originalBlob: file,
        order: pages.length + 1,
      };
      addPage(page);
      if (!selectedId) {
        setSelectedId(id);
      }
    }
    // reset input
    e.target.value = "";
  };

  const handleExport = async () => {
    if (pages.length === 0) return;
    const blobs = pages.map((p) => p.originalBlob);
    const pdfBytes = await imagesToPDF(blobs);
    const safeBytes = Uint8Array.from(pdfBytes);
    const pdfBlob = new Blob([safeBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scanned.pdf";
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const selectedPage = pages.find((p) => p.id === selectedId);
    if (!selectedPage) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(selectedPage.originalBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pages, selectedId]);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <aside style={{ width: 260, padding: 12, borderRight: "1px solid #ddd", overflowY: "auto" }}>
        <PageSorter />
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, padding: 12, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <header style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <button onClick={handleAddClick} style={{ padding: "6px 12px" }}>
            Add Page
          </button>
          <button onClick={handleExport} style={{ padding: "6px 12px" }}>
            Export PDF
          </button>
        </header>

        {/* Hidden file input */}
        <input
          type="file"
          accept="image/*"
          multiple
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {/* Preview area */}
        <section style={{ flex: 1, border: "1px solid #eee", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {previewUrl ? (
            <img src={previewUrl} alt="preview" style={{ maxWidth: "100%", maxHeight: "100%" }} />
          ) : (
            <p>Select a page to preview.</p>
          )}
        </section>
      </main>
    </div>
  );
}




