// src/hooks/useSidebar.ts
import { useState, useEffect } from 'react';

export function useSidebar(initialState = true) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(initialState);

  // Responsive default: close sidebar on mobile initial load
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, []);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);

  return { isSidebarOpen, toggleSidebar, closeSidebar };
}