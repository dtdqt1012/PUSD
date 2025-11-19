import { useState, useCallback, useMemo } from 'react';

/**
 * Shared hook for expandable sections
 * Optimizes re-renders with useCallback and useMemo
 */
export function useExpandable(initialState = false) {
  const [isExpanded, setIsExpanded] = useState(initialState);
  
  const toggle = useCallback(() => setIsExpanded(prev => !prev), []);
  const expand = useCallback(() => setIsExpanded(true), []);
  const collapse = useCallback(() => setIsExpanded(false), []);
  
  const headerStyle = useMemo(() => ({ 
    cursor: 'pointer', 
    userSelect: 'none' as const 
  }), []);
  
  const toggleIcon = useMemo(() => isExpanded ? '▼' : '▶', [isExpanded]);
  
  return {
    isExpanded,
    toggle,
    expand,
    collapse,
    setIsExpanded,
    headerStyle,
    toggleIcon,
  };
}

