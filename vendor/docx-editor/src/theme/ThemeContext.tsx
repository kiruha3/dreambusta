import React, { createContext, useContext, useMemo, useEffect } from "react";

export interface EditorTheme {
  // Primary accent color for comments highlights
  commentHighlight: string;
  commentHighlightHover: string;
  commentHighlightActive: string;
  commentHighlightResolved: string;
  
  // Author avatar colors
  avatarBackground: string;
  avatarText: string;
  
  // Status colors
  resolvedBadgeBackground: string;
  resolvedBadgeText: string;
  
  // Button accent
  primaryButton: string;
  primaryButtonText: string;
}

// Default theme: blue primary color
const defaultTheme: EditorTheme = {
  // Blue for comments
  commentHighlight: "rgba(59, 130, 246, 0.15)",
  commentHighlightHover: "rgba(59, 130, 246, 0.25)",
  // Blue for active comment
  commentHighlightActive: "rgba(59, 130, 246, 0.35)",
  commentHighlightResolved: "rgba(100, 116, 139, 0.15)",
  
  avatarBackground: "rgba(59, 130, 246, 0.15)",
  avatarText: "rgb(37, 99, 235)",
  
  // Blue for resolved badge (was green)
  resolvedBadgeBackground: "rgba(59, 130, 246, 0.1)",
  resolvedBadgeText: "rgb(37, 99, 235)",
  
  primaryButton: "rgb(59, 130, 246)",
  primaryButtonText: "white",
};

// Yellow-blue theme (yellow default, blue active) - same as default
export const yellowBlueTheme: EditorTheme = {
  ...defaultTheme,
};

// All-blue theme
export const blueTheme: EditorTheme = {
  commentHighlight: "rgba(59, 130, 246, 0.2)",
  commentHighlightHover: "rgba(59, 130, 246, 0.3)",
  commentHighlightActive: "rgba(59, 130, 246, 0.4)",
  commentHighlightResolved: "rgba(100, 116, 139, 0.15)",
  
  avatarBackground: "rgba(59, 130, 246, 0.15)",
  avatarText: "rgb(37, 99, 235)",
  
  resolvedBadgeBackground: "rgba(59, 130, 246, 0.1)",
  resolvedBadgeText: "rgb(37, 99, 235)",
  
  primaryButton: "rgb(59, 130, 246)",
  primaryButtonText: "white",
};

interface ThemeContextValue {
  theme: EditorTheme;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: defaultTheme,
});

interface ThemeProviderProps {
  children: React.ReactNode;
  theme?: Partial<EditorTheme>;
}

export function ThemeProvider({ children, theme: customTheme }: ThemeProviderProps) {
  const theme = useMemo<EditorTheme>(() => ({
    ...defaultTheme,
    ...customTheme,
  }), [customTheme]);

  // Set CSS variables on document root for native CSS access
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--editor-comment-highlight', theme.commentHighlight);
    root.style.setProperty('--editor-comment-highlight-hover', theme.commentHighlightHover);
    root.style.setProperty('--editor-comment-highlight-active', theme.commentHighlightActive);
    root.style.setProperty('--editor-comment-highlight-resolved', theme.commentHighlightResolved);
    root.style.setProperty('--editor-avatar-bg', theme.avatarBackground);
    root.style.setProperty('--editor-avatar-text', theme.avatarText);
    root.style.setProperty('--editor-primary-button', theme.primaryButton);
    root.style.setProperty('--editor-primary-button-text', theme.primaryButtonText);
  }, [theme]);

  const value = useMemo(() => ({ theme }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useEditorTheme(): EditorTheme {
  return useContext(ThemeContext).theme;
}

export { defaultTheme };

