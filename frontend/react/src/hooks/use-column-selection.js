import { useState, useCallback } from 'react';

export function useColumnSelection() {
  const [selectedColumn, setSelectedColumn] = useState(null);
  const [highlightedPaths, setHighlightedPaths] = useState([]);

  const selectColumn = useCallback((nodeId, columnName) => {
    setSelectedColumn({ nodeId, columnName });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedColumn(null);
    setHighlightedPaths([]);
  }, []);

  const highlightLineagePath = useCallback((pathEdges) => {
    setHighlightedPaths(pathEdges);
  }, []);

  const isColumnSelected = useCallback((nodeId, columnName) => {
    return selectedColumn?.nodeId === nodeId && selectedColumn?.columnName === columnName;
  }, [selectedColumn]);

  const isPathHighlighted = useCallback((edgeId) => {
    return highlightedPaths.includes(edgeId);
  }, [highlightedPaths]);

  return {
    selectedColumn,
    highlightedPaths,
    selectColumn,
    clearSelection,
    highlightLineagePath,
    isColumnSelected,
    isPathHighlighted
  };
}