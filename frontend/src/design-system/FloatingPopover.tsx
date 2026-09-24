import { useEffectEvent, useLayoutEffect, useRef, type HTMLAttributes, type RefObject } from 'react';

const openLayers: HTMLElement[] = [];
const MARGIN = 8;
const GAP = 6;

type FloatingPopoverProps = Omit<HTMLAttributes<HTMLDivElement>, 'onClose'> & {
  anchorRef?: RefObject<HTMLElement | null>;
  point?: { x: number; y: number };
  align?: 'start' | 'end';
  width?: number;
  maxHeight?: number;
  onClose: () => void;
};

/** The browser top layer escapes ancestor clipping without losing DOM context or focus order. */
export function FloatingPopover({ anchorRef, point, align = 'end', width = 280, maxHeight = 420, onClose, children, ...props }: FloatingPopoverProps) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useEffectEvent(onClose);
  const x = point?.x;
  const y = point?.y;

  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const anchor = anchorRef?.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    function place() {
      if (!element) return;
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0;
      const topEdge = viewport?.offsetTop ?? 0;
      const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth);
      const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight);
      const availableWidth = Math.max(1, rightEdge - leftEdge - MARGIN * 2);
      const panelWidth = Math.min(width, availableWidth);
      const rect = anchor?.getBoundingClientRect();
      const top = rect?.top ?? y ?? topEdge + MARGIN;
      const bottom = rect?.bottom ?? y ?? top;
      const above = Math.max(0, top - topEdge - GAP - MARGIN);
      const below = Math.max(0, bottomEdge - bottom - GAP - MARGIN);
      const downward = below >= Math.min(maxHeight, 220) || below >= above;
      const heightLimit = Math.max(1, Math.min(maxHeight, downward ? below : above));
      element.style.setProperty('--dc-floating-width', `${panelWidth}px`);
      element.style.setProperty('--dc-floating-height', `${heightLimit}px`);
      const height = element.getBoundingClientRect().height;
      const preferredLeft = rect ? (align === 'end' ? rect.right - panelWidth : rect.left) : x ?? leftEdge + MARGIN;
      const left = Math.max(leftEdge + MARGIN, Math.min(preferredLeft, rightEdge - panelWidth - MARGIN));
      const preferredTop = downward ? bottom + GAP : top - GAP - height;
      const panelTop = Math.max(topEdge + MARGIN, Math.min(preferredTop, bottomEdge - height - MARGIN));
      element.style.setProperty('--dc-floating-left', `${left}px`);
      element.style.setProperty('--dc-floating-top', `${panelTop}px`);
    }
    if (element.showPopover) element.showPopover();
    else element.removeAttribute('popover');
    place();
    openLayers.push(element);
    // Menus can be operated immediately with arrows or Tab. Search popovers retain their input focus.
    if (props.role === 'menu') element.querySelector<HTMLElement>('button:not(:disabled), [role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
    function pointerDown(event: PointerEvent) {
      if (openLayers.at(-1) !== element) return;
      if (!element!.contains(event.target as Node) && !anchor?.contains(event.target as Node)) close();
    }
    function keyDown(event: KeyboardEvent) {
      if (openLayers.at(-1) !== element) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
        (anchor ?? previousFocus)?.focus({ preventScroll: true });
      } else if (props.role === 'menu' && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        const items = Array.from(element!.querySelectorAll<HTMLElement>('button:not(:disabled), [role="menuitem"]:not(:disabled)'));
        if (!items.length) return;
        event.preventDefault();
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    }
    function scroll(event: Event) {
      if (event.target instanceof Node && element!.contains(event.target)) return;
      if (anchor) place(); else close();
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(element);
    if (anchor) observer?.observe(anchor);
    window.addEventListener('pointerdown', pointerDown, true);
    window.addEventListener('keydown', keyDown, true);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      observer?.disconnect();
      const index = openLayers.indexOf(element);
      if (index >= 0) openLayers.splice(index, 1);
      window.removeEventListener('pointerdown', pointerDown, true);
      window.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
      if (element.hidePopover && element.matches(':popover-open')) element.hidePopover();
    };
  }, [anchorRef, x, y, align, width, maxHeight, props.role]);

  return <div {...props} ref={panel} popover="manual" data-floating-layer="" tabIndex={-1}>{children}</div>;
}
