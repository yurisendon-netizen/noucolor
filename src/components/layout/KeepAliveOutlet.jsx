import { useOutlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useRef, useLayoutEffect } from 'react';

// Module-level caches survive across renders (and across tab switches).
const outletCache = new Map(); // pathname -> outlet element (kept mounted)
const scrollCache = new Map(); // pathname -> last scrollTop

export default function KeepAliveOutlet({ keepAlivePaths = [] }) {
  const outlet = useOutlet();
  const location = useLocation();
  const path = location.pathname;
  const nodesRef = useRef(new Map());
  const prevPathRef = useRef(path);

  const isKeepAlive = keepAlivePaths.includes(path);
  // Only cache tab-root routes so heavy pages (map, etc.) mount/unmount normally.
  if (outlet && isKeepAlive) outletCache.set(path, outlet);

  // Restore the incoming route's scroll position before paint (no flash).
  useLayoutEffect(() => {
    if (path !== prevPathRef.current) {
      prevPathRef.current = path;
      const node = nodesRef.current.get(path);
      if (node) node.scrollTop = scrollCache.get(path) || 0;
    }
  }, [path]);

  function renderPanel(key, el, isActive) {
    return (
      <div
        key={key}
        ref={(node) => { if (node) nodesRef.current.set(key, node); else nodesRef.current.delete(key); }}
        onScroll={(e) => scrollCache.set(key, e.currentTarget.scrollTop)}
        className="absolute inset-0 overflow-y-auto overscroll-none"
        style={{ display: isActive ? 'block' : 'none' }}
      >
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={isActive ? { opacity: 1, x: 0 } : { opacity: 0, x: 24 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          className="min-h-full pb-24 lg:pb-0"
        >
          {el}
        </motion.div>
      </div>
    );
  }

  return (
    <>
      {[...outletCache.entries()].map(([k, el]) => renderPanel(k, el, k === path))}
      {!isKeepAlive && outlet && renderPanel(path, outlet, true)}
    </>
  );
}