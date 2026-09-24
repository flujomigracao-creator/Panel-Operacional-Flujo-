/**
 * useHorizontalDragScroll.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook reutilizable para scroll horizontal mediante arrastre (mouse drag).
 * Soporta click izquierdo y derecho. Previene el menú contextual durante el
 * arrastre para permitir navegación fluida con click derecho.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useRef } from 'react';

export default function useHorizontalDragScroll() {
  const scrollContainerRef = useRef(null);
  const isScrollDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const handleMouseDown = (e) => {
    // Habilitar arrastre con click derecho (2) o izquierdo (0)
    if (e.button === 2 || e.button === 0) {
      isScrollDragging.current = true;
      startX.current = e.pageX - scrollContainerRef.current.offsetLeft;
      scrollLeft.current = scrollContainerRef.current.scrollLeft;
      scrollContainerRef.current.style.cursor = 'grabbing';
      scrollContainerRef.current.style.userSelect = 'none';
    }
  };

  const handleMouseLeave = () => {
    isScrollDragging.current = false;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.cursor = 'default';
      scrollContainerRef.current.style.userSelect = 'auto';
    }
  };

  const handleMouseUp = () => {
    isScrollDragging.current = false;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.cursor = 'default';
      scrollContainerRef.current.style.userSelect = 'auto';
    }
  };

  const handleMouseMove = (e) => {
    if (!isScrollDragging.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5; // Velocidad de arrastre
    scrollContainerRef.current.scrollLeft = scrollLeft.current - walk;
  };

  const handleContextMenu = (e) => {
    // Prevenir el menú contextual para que el arrastre con click derecho funcione
    // Solo lo evitamos si el target no es un input/textarea
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  };

  /** Spread these directly onto the scrollable container element */
  const scrollHandlers = {
    onMouseDown: handleMouseDown,
    onMouseLeave: handleMouseLeave,
    onMouseUp: handleMouseUp,
    onMouseMove: handleMouseMove,
    onContextMenu: handleContextMenu,
  };

  return { scrollContainerRef, scrollHandlers };
}
