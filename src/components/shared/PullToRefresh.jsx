import React, { useRef, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

const THRESHOLD = 70;

function getScrollParent(node) {
  let el = node?.parentElement;
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return null;
}

export default function PullToRefresh({ onRefresh, children }) {
  const ref = useRef(null);
  const startY = useRef(0);
  const pulling = useRef(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = useCallback((e) => {
    if (refreshing || !onRefresh) return;
    const sp = getScrollParent(ref.current);
    const top = sp ? sp.scrollTop : window.scrollY;
    if (top > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }, [refreshing, onRefresh]);

  const onTouchMove = useCallback((e) => {
    if (!pulling.current) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      e.preventDefault();
      setPull(Math.min(delta * 0.5, THRESHOLD * 1.5));
    }
  }, []);

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pull >= THRESHOLD && onRefresh) {
      setRefreshing(true);
      setPull(THRESHOLD);
      try { await onRefresh(); } catch (err) { /* ignore */ }
      setRefreshing(false);
    }
    setPull(0);
  }, [pull, onRefresh]);

  if (!onRefresh) return <>{children}</>;

  return (
    <div ref={ref} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {(pull > 0 || refreshing) && (
        <div className="flex items-center justify-center overflow-hidden transition-[height] duration-150" style={{ height: pull }}>
          <RefreshCw className={`text-muted-foreground ${refreshing ? 'animate-spin' : ''}`} size={20} />
        </div>
      )}
      {children}
    </div>
  );
}