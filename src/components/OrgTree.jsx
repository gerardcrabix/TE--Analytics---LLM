import { Children, cloneElement, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { opStatusPill, statusColorFor } from '../lib/dashboardIndex';

/** Draws the horizontal line connecting the midpoints of the first and last
 * child in a row, exactly like the prototype's `connectTreeLines` — measured
 * post-layout since card widths vary with content.
 *
 * Measures via refs on the first/last child directly (not `row.children`) —
 * the line itself is a DOM child of the row too, so indexing into
 * `row.children` after it's been inserted would measure the line against
 * itself and oscillate forever. */
function ConnectorRow({ children }) {
  const rowRef = useRef(null);
  const firstRef = useRef(null);
  const lastRef = useRef(null);
  const [line, setLine] = useState(null);

  const items = Children.toArray(children);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const firstEl = firstRef.current, lastEl = lastRef.current;
    if (!row || !firstEl || !lastEl) {
      setLine((prev) => (prev === null ? prev : null));
      return;
    }
    const rowRect = row.getBoundingClientRect();
    const firstRect = firstEl.getBoundingClientRect();
    const lastRect = lastEl.getBoundingClientRect();
    const left = Math.round(firstRect.left + firstRect.width / 2 - rowRect.left);
    const width = Math.max(2, Math.round(lastRect.left + lastRect.width / 2 - rowRect.left - left));
    setLine((prev) => (prev && prev.left === left && prev.width === width ? prev : { left, width }));
  });

  return (
    <div ref={rowRef} style={{ display: 'flex', gap: 24, position: 'relative' }}>
      {line && <div style={{ position: 'absolute', top: 0, left: line.left, width: line.width, height: 2, background: 'oklch(72% 0.01 60)', pointerEvents: 'none' }} />}
      {items.map((item, i) => cloneElement(item, { ref: i === 0 ? firstRef : i === items.length - 1 ? lastRef : undefined }))}
    </div>
  );
}

function TreeNode({ node, expanded, onToggle, onSelectRoot, onForceSubtree }) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded.has(node.userId);
  const pillInfo = node.opStatusIdx !== null && node.opStatusIdx !== undefined ? opStatusPill(node.opStatusIdx) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        onClick={hasChildren ? () => onToggle(node.userId) : undefined}
        style={{
          position: 'relative', minWidth: 170, maxWidth: 200, background: 'white', border: '1px solid var(--border)',
          borderLeft: `3px solid ${statusColorFor(node.status)}`, borderRadius: 8, padding: '10px 12px',
          boxShadow: '0 1px 2px rgba(0,0,0,.04)', cursor: hasChildren ? 'pointer' : 'default',
        }}
      >
        <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name || ''}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: 'var(--muted-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.title || ''}</div>
          {pillInfo && <span style={{ flex: 'none', fontSize: 8.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: pillInfo.bg, color: pillInfo.color }}>{pillInfo.label}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColorFor(node.status), flex: 'none' }} />
          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{node.sum === null ? 'N/A' : node.sum + ' prompts'}</span>
          {hasChildren && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--muted-2)' }}>{node.children.length} pers. {isExpanded ? '▾' : '▸'}</span>}
        </div>
        {hasChildren && (
          <div style={{ fontSize: 10, color: 'var(--muted-2)', marginTop: 5, borderTop: '1px solid var(--row-border)', paddingTop: 5 }}>
            {node.leafTotal} pers. · {node.leafActive} actifs ({node.leafActiveOp} Op/{node.leafActiveNonOp} Non-Op) / {node.leafInactive} inactifs ({node.leafInactiveOp} Op/{node.leafInactiveNonOp} Non-Op)
          </div>
        )}
        <button
          title="Faire de cette personne le point de départ (N+1/N+2/N+3)"
          onClick={(e) => { e.stopPropagation(); onSelectRoot(node.userId); }}
          style={{ position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 4, border: '1px solid var(--border-2)', background: 'white', fontSize: 10, cursor: 'pointer', lineHeight: 1, padding: 0, color: 'var(--purple)' }}
        >⌖</button>
        <button
          title={'Forcer Operator sur cette branche (job description : ' + (node.jobDescLabel || '—') + ')'}
          onClick={(e) => { e.stopPropagation(); onForceSubtree(node, 'operator'); }}
          style={{ position: 'absolute', top: 6, right: 26, width: 18, height: 18, borderRadius: 4, border: '1px solid var(--teal)', background: 'white', fontSize: 9, fontWeight: 700, cursor: 'pointer', lineHeight: 1, padding: 0, color: 'var(--teal)' }}
        >O</button>
        <button
          title={'Forcer Non-Operator sur cette branche (job description : ' + (node.jobDescLabel || '—') + ')'}
          onClick={(e) => { e.stopPropagation(); onForceSubtree(node, 'nonOperator'); }}
          style={{ position: 'absolute', top: 6, right: 46, width: 18, height: 18, borderRadius: 4, border: '1px solid var(--amber)', background: 'white', fontSize: 9, fontWeight: 700, cursor: 'pointer', lineHeight: 1, padding: 0, color: 'var(--amber)' }}
        >N</button>
      </div>
      {hasChildren && isExpanded && (
        <>
          <div style={{ width: 2, height: 18, background: 'oklch(72% 0.01 60)' }} />
          <ConnectorRow>
            {node.children.map((child) => (
              <div key={child.userId} style={{ position: 'relative', paddingTop: 18, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 2, height: 18, background: 'oklch(72% 0.01 60)' }} />
                <TreeNode node={child} expanded={expanded} onToggle={onToggle} onSelectRoot={onSelectRoot} onForceSubtree={onForceSubtree} />
              </div>
            ))}
          </ConnectorRow>
        </>
      )}
    </div>
  );
}

function initialExpansion(root, maxAutoDepth = 2) {
  const expanded = new Set();
  const walk = (n, d) => { if (d >= maxAutoDepth) return; expanded.add(n.userId); n.children.forEach((c) => walk(c, d + 1)); };
  if (root) walk(root, 0);
  return expanded;
}

export function OrgTree({ root, onSelectRoot, onForceSubtree }) {
  const [expanded, setExpanded] = useState(() => initialExpansion(root));
  const rootUserId = root && root.userId;

  useEffect(() => {
    setExpanded(initialExpansion(root));
    // Only re-expand from scratch when the root person actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootUserId]);

  const onToggle = (userId) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(userId)) next.delete(userId); else next.add(userId);
    return next;
  });

  if (!root) return null;
  return (
    <div style={{ display: 'inline-block', minWidth: '100%' }}>
      <TreeNode node={root} expanded={expanded} onToggle={onToggle} onSelectRoot={onSelectRoot} onForceSubtree={onForceSubtree} />
    </div>
  );
}
