import { useEffect, useState } from 'react';
import { opStatusPill } from '../lib/dashboardIndex';

const OP_COLOR = 'var(--teal)', NONOP_COLOR = 'var(--amber)';

function DomainRow({ node, depth, expanded, onToggle, onForce, onRevert, highlightKey }) {
  const isLeaf = !node.children || node.children.length === 0;
  const isExpanded = expanded.has(node.key);
  const isHighlighted = highlightKey && node.key === highlightKey;
  const natural = isLeaf ? opStatusPill(node.naturalStatus === 'operator' ? 0 : 1) : null;
  const effective = isLeaf && node.overrideValue ? opStatusPill(node.effStatus === 'operator' ? 0 : 1) : null;

  return (
    <>
      <div style={{ marginLeft: depth * 22, padding: '10px 12px', borderRadius: 8, background: isHighlighted ? 'oklch(94% 0.05 190)' : (depth === 0 ? 'var(--panel)' : 'white'), border: isHighlighted ? '1px solid oklch(58% 0.11 190)' : '1px solid var(--row-border)', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {!isLeaf ? (
            <span onClick={() => onToggle(node.key)} style={{ cursor: 'pointer', fontSize: 11, color: 'var(--muted-2)', flex: 'none', width: 14 }}>{isExpanded ? '▾' : '▸'}</span>
          ) : (
            <span style={{ width: 14, flex: 'none' }} />
          )}
          <span style={{ fontSize: depth === 0 ? 13 : 12, fontWeight: depth === 0 ? 700 : 600 }}>{node.name}</span>
          {natural && <span style={{ flex: 'none', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: natural.bg, color: natural.color }}>Origine : {natural.label}</span>}
          {effective && (
            <>
              <span style={{ fontSize: 10, color: 'var(--muted-2)', flex: 'none' }}>→</span>
              <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: effective.bg, color: effective.color }}>Forcé : {effective.label}</span>
            </>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
          {node.total} pers. · {node.active} actifs ({node.opActive} Op/{node.nonOpActive} Non-Op) · {node.inactive} inactifs ({node.opTotal - node.opActive} Op/{node.nonOpTotal - node.nonOpActive} Non-Op)
        </div>
        {isLeaf && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => onForce(node.jobDescIdx, 'operator')}
              style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 5, border: `1px solid ${OP_COLOR}`, background: node.effStatus === 'operator' ? OP_COLOR : 'white', color: node.effStatus === 'operator' ? 'white' : OP_COLOR, cursor: 'pointer' }}
            >Forcer Operator</button>
            <button
              onClick={() => onForce(node.jobDescIdx, 'nonOperator')}
              style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 5, border: `1px solid ${NONOP_COLOR}`, background: node.effStatus === 'nonOperator' ? NONOP_COLOR : 'white', color: node.effStatus === 'nonOperator' ? 'white' : NONOP_COLOR, cursor: 'pointer' }}
            >Forcer Non-Op</button>
            {node.overrideValue && (
              <button
                title="Revenir à la classification d’origine pour ce job description"
                onClick={() => onRevert(node.jobDescIdx)}
                style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 5, border: '1px solid var(--muted-2)', background: 'white', color: 'oklch(45% 0.01 60)', cursor: 'pointer' }}
              >↺ Origine</button>
            )}
          </div>
        )}
      </div>
      {!isLeaf && isExpanded && node.children.map((child) => (
        <DomainRow key={child.key} node={child} depth={depth + 1} expanded={expanded} onToggle={onToggle} onForce={onForce} onRevert={onRevert} highlightKey={highlightKey} />
      ))}
    </>
  );
}

/** `expandKeys` (a Set, new reference each time) force-expands the given
 * node keys on top of whatever's already open — used to jump straight to a
 * domain-search result without collapsing anything the user had open.
 * `highlightKey` briefly-but-durably highlights the jumped-to node. */
export function DomainTree({ root, onForce, onRevert, expandKeys, highlightKey }) {
  const [expanded, setExpanded] = useState(() => new Set(root ? [root.key] : []));
  const rootKey = root && root.key;

  useEffect(() => { setExpanded(new Set(rootKey ? [rootKey] : [])); }, [rootKey]);
  useEffect(() => {
    if (!expandKeys) return;
    setExpanded((prev) => new Set([...prev, ...expandKeys]));
  }, [expandKeys]);

  const onToggle = (key) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  if (!root) return null;
  return <div>{<DomainRow node={root} depth={0} expanded={expanded} onToggle={onToggle} onForce={onForce} onRevert={onRevert} highlightKey={highlightKey} />}</div>;
}
