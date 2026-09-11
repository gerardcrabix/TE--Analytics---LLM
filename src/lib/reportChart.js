/** Draws the "Domain decomposition" tree diagram (Total → Operator/Non-Operator
 * → top 4 domains) used both as an inline thumbnail in the Rapport tab and as
 * a full-slide image in the exported .pptx — a canvas rendering rather than
 * DOM/SVG so it can be embedded as a static image in the deck. */
export function buildDecompositionTree(rows, breakdown, opts = {}) {
  const W = 1300, H = 700;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  const dark = '#414141', accent = '#F28D00', teal = '#2E4957', grey = '#8A8A8A';

  const box = (x, y, w, h, title, line2, line3, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#CCCCCC';
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title, x + w / 2, y + 20);
    ctx.font = '12px Arial';
    if (line2) ctx.fillText(line2, x + w / 2, y + 38);
    if (line3) ctx.fillText(line3, x + w / 2, y + 55);
  };
  const elbow = (x1, y1, x2, y2) => {
    const midY = y1 + (y2 - y1) / 2;
    ctx.strokeStyle = '#B7B7B7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x1, midY); ctx.lineTo(x2, midY); ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  const panelW = 600, gapPanels = 40;
  const panels = [
    { x: 20, key: 'before', title: 'Actuel (sans reclassification)' },
    { x: 20 + panelW + gapPanels, key: 'after', title: 'Scénario Non-Op → Op' },
  ];
  const all = rows[0], op = rows[1], nonOp = rows[2];
  panels.forEach((panel) => {
    const px = panel.x;
    ctx.fillStyle = dark;
    ctx.font = 'bold 15px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(panel.title, px + panelW / 2, 22);
    const totKey = panel.key, pctKey = panel.key + 'Pct';
    const rootW = 200, rootH = 62, rootX = px + panelW / 2 - rootW / 2, rootY = 40;
    box(rootX, rootY, rootW, rootH, 'Total', `${all[totKey]} pers.`, `${all[pctKey]}% actifs`, dark);
    const midY = 150, boxW = 235, boxH = 70;
    const opX = px + panelW / 2 - boxW - 20, nonOpX = px + panelW / 2 + 20;
    box(opX, midY, boxW, boxH, 'Operator', `${op[totKey]} pers.`, `${op[pctKey]}% actifs`, teal);
    box(nonOpX, midY, boxW, boxH, 'Non-Operator', `${nonOp[totKey]} pers.`, `${nonOp[pctKey]}% actifs`, accent);
    elbow(rootX + rootW / 2, rootY + rootH, opX + boxW / 2, midY);
    elbow(rootX + rootW / 2, rootY + rootH, nonOpX + boxW / 2, midY);
    const totKeyFn = panel.key === 'before' ? 'beforeNonOpTotal' : 'afterNonOpTotal';
    const pctKeyFn = panel.key === 'before' ? 'beforePct' : 'afterPct';
    const funcs = (breakdown.byFunction || []).filter((f) => f[totKeyFn] > 0).sort((a, b) => b[totKeyFn] - a[totKeyFn]).slice(0, 4);
    const leafY = 300, leafW = 132, leafH = 62, gap = 14;
    const totalLeafW = funcs.length * leafW + Math.max(0, funcs.length - 1) * gap;
    const startX = px + panelW / 2 - totalLeafW / 2;
    funcs.forEach((f, i) => {
      const x = startX + i * (leafW + gap);
      box(x, leafY, leafW, leafH, (f.label || 'N/D').slice(0, 16), `${f[totKeyFn]} pers.`, f[pctKeyFn] === null ? '—' : `${f[pctKeyFn]}% actifs`, grey);
      elbow(nonOpX + boxW / 2, midY + boxH, x + leafW / 2, leafY);
    });
  });
  ctx.strokeStyle = '#E3E3E3';
  ctx.beginPath(); ctx.moveTo(W / 2, 30); ctx.lineTo(W / 2, H - 40); ctx.stroke();
  ctx.fillStyle = dark;
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`Décomposition — ${opts.periodLabel || ''}${opts.contractorLabel ? ' — ' + opts.contractorLabel : ''}`, 12, H - 12);
  return canvas.toDataURL('image/png');
}
