import { useState, useCallback, useEffect } from "react";
import { Descendant } from "slate";
import type { Version } from "../components/SlateEditor";

const MAX_VERSIONS = 20;

export function useVersioning(_initialContent: Descendant[]) {
  const [versions, setVersions] = useState<Version[]>([]);

  // Load versions from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("doc_versions");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only load if valid array
        if (Array.isArray(parsed)) {
          setVersions(parsed.slice(0, MAX_VERSIONS));
        }
      }
    } catch (e) {
      // Ignore errors
    }
  }, []);

  const createVersion = useCallback((content: Descendant[], description: string = "Save") => {
    const newVersion: Version = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      description,
      content,
    };

    setVersions((prev) => {
      const newVersions = [newVersion, ...prev].slice(0, MAX_VERSIONS);
      // Save to localStorage async
      setTimeout(() => {
        try {
          localStorage.setItem("doc_versions", JSON.stringify(newVersions));
        } catch (e) {
          // Ignore quota errors
        }
      }, 0);
      return newVersions;
    });
  }, []);

  return {
    versions,
    createVersion,
  };
}
