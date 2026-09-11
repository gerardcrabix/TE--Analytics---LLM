import JSZip from 'jszip';

/** Rasterizes an SVG (used as a company logo inside a .pptx) to a PNG data
 * URL — pptxgenjs can't embed SVG directly. */
function rasterizeSvg(svgText) {
  return new Promise((resolve) => {
    try {
      const blob = new Blob([svgText], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || 400, h = img.naturalHeight || 200;
        const scale = 400 / w;
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = Math.round(h * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

/** Extracts a lightweight "brand kit" from an uploaded .pptx template —
 * theme colors and heading font from ppt/theme/theme1.xml, a logo (smallest
 * embedded image, preferring an SVG), and a cover-slide background (the
 * largest embedded image, if substantial) — so the generated Rapport .pptx
 * can visually match an existing corporate template without the user having
 * to configure colors by hand. Everything happens client-side via JSZip;
 * the .pptx itself is never uploaded anywhere. */
export async function extractPptxBranding(file) {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  let colors = {}, fontFamily = null, logoBase64 = null;

  const themeName = Object.keys(zip.files).find((n) => /ppt\/theme\/theme1\.xml$/.test(n));
  if (themeName) {
    const xml = await zip.files[themeName].async('text');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const getClr = (tag) => {
      const el = doc.getElementsByTagName(tag)[0];
      const srgb = el ? el.getElementsByTagName('a:srgbClr')[0] : null;
      return srgb ? '#' + srgb.getAttribute('val') : null;
    };
    colors = { dk2: getClr('a:dk2'), lt2: getClr('a:lt2'), accent1: getClr('a:accent1'), accent2: getClr('a:accent2') };
    const majorFont = doc.getElementsByTagName('a:majorFont')[0];
    const latin = majorFont ? majorFont.getElementsByTagName('a:latin')[0] : null;
    fontFamily = latin ? latin.getAttribute('typeface') : null;
  }

  const svgNames = Object.keys(zip.files).filter((n) => /ppt\/media\/.*\.svg$/i.test(n)).sort();
  if (svgNames.length) {
    const svgText = await zip.files[svgNames[0]].async('text');
    logoBase64 = await rasterizeSvg(svgText);
  }
  const rasterCandidates = Object.keys(zip.files).filter((n) => /ppt\/media\/.*\.(png|jpe?g)$/i.test(n));
  const sized = await Promise.all(rasterCandidates.map(async (n) => ({ n, size: (await zip.files[n].async('uint8array')).length })));
  sized.sort((a, b) => a.size - b.size);
  if (!logoBase64 && sized.length) {
    const blob = await zip.files[sized[0].n].async('blob');
    logoBase64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  }
  let coverBg = null;
  if (sized.length) {
    const biggest = sized[sized.length - 1];
    if (biggest.size > 100000) {
      const blob = await zip.files[biggest.n].async('blob');
      coverBg = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
    }
  }
  return { fileName: file.name, colors, fontFamily, logoBase64, coverBg };
}
