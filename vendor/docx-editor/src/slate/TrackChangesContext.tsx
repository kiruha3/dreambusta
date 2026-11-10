import React, { createContext, useContext, useState, useCallback } from "react";

interface TrackChangesContextValue {
  onAcceptChange: (changeId: string) => void;
  onRejectChange: (changeId: string) => void;
  hoveredChangeId: string | null;
  setHoveredChangeId: (id: string | null) => void;
}

const TrackChangesContext = createContext<TrackChangesContextValue | null>(null);

export function useTrackChangesContext() {
  return useContext(TrackChangesContext);
}

interface TrackChangesProviderProps {
  children: React.ReactNode;
  onAcceptChange: (changeId: string) => void;
  onRejectChange: (changeId: string) => void;
}

export function TrackChangesProvider({ 
  children, 
  onAcceptChange, 
  onRejectChange 
}: TrackChangesProviderProps) {
  const [hoveredChangeId, setHoveredChangeId] = useState<string | null>(null);

  return (
    <TrackChangesContext.Provider value={{ 
      onAcceptChange, 
      onRejectChange,
      hoveredChangeId,
      setHoveredChangeId,
    }}>
      {children}
    </TrackChangesContext.Provider>
  );
}

