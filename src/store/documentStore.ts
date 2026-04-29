import { create } from "zustand";

export type ScannedPage = {
  id: string;
  originalBlob: Blob;
  order: number;
};

type DocumentStore = {
  pages: ScannedPage[];
  addPage: (page: ScannedPage) => void;
  removePage: (id: string) => void;
  reorderPages: (newOrder: ScannedPage[]) => void;
};

export const useDocumentStore = create<DocumentStore>((set) => ({
  pages: [],
  addPage: (page) =>
    set((state) => ({
      pages: [...state.pages, { ...page, order: state.pages.length + 1 }],
    })),
  removePage: (id) =>
    set((state) => ({
      pages: state.pages
        .filter((page) => page.id !== id)
        .map((page, index) => ({ ...page, order: index + 1 })),
    })),
  reorderPages: (newOrder) =>
    set(() => ({
      pages: newOrder.map((page, index) => ({ ...page, order: index + 1 })),
    })),
}));
