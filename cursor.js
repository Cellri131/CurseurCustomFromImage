/**
 * AsciiCursor — curseur SVG multi-couches basé sur une grille ASCII.
 *
 * Usage (dans n'importe quelle page) :
 *
 *   <script src="cursor.js"></script>
 *   <script>
 *     AsciiCursor.init([
 *       { ascii: `00: XO...\n01: OOOO...`, color: '#ffaa00' },
 *       { ascii: `00: X....\n01: OO...`,  color: '#ff4400' }
 *     ], { size: '180px', hideCursor: true });
 *   </script>
 *
 * Options :
 *   size        — taille du container SVG  (défaut : '180px')
 *   hideCursor  — masque le curseur natif  (défaut : true)
 *   zIndex      — z-index du div curseur   (défaut : 9999)
 *   scaleRef    — nb d'unités SVG cibles pour toute la hauteur de grille (défaut : 50)
 *                 → contrôle la taille apparente de la forme
 */
;(function (global) {
  'use strict';

  /* ── Utilitaires vectoriels ──────────────────────────────────────────── */
  const add  = (a,b) => [a[0]+b[0], a[1]+b[1]];
  const sub  = (a,b) => [a[0]-b[0], a[1]-b[1]];
  const mul  = (a,s) => [a[0]*s,    a[1]*s   ];
  const dot  = (a,b) =>  a[0]*b[0] + a[1]*b[1];
  const vlen = (a)   =>  Math.hypot(a[0], a[1]);
  const lerp = (a,b,t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t];

  /* ── Parsing ASCII (format "NN: contenu" ou lignes brutes) ──────────── */
  function parseAscii(text) {
    const lines = text.split(/\r?\n/)
      .map(l => { const m = l.match(/^\s*\d{1,3}:\s*(.*)$/); return (m?m[1]:l).replace(/\r/g,''); })
      .filter(l => l.length > 0);
    if (!lines.length) return { grid: [[]], w:0, h:0 };
    const h = lines.length, w = Math.max(...lines.map(l => l.length));
    const grid = Array.from({length:h}, () => Array(w).fill('.'));
    for (let y=0; y<h; y++) for (let x=0; x<w; x++) grid[y][x] = lines[y][x] || '.';
    return { grid, w, h };
  }

  /* ── Masque & tracé de contours (Moore neighborhood, trous inclus) ───── */
  function buildMask(grid) {
    return grid.map(row => row.map(c => (c==='O'||c==='X'||c==='C'||c==='D') ? 1 : 0));
  }

  function traceAllContours(mask) {
    const h=mask.length, w=mask[0].length, ph=h+2, pw=w+2;
    const g = Array.from({length:ph}, () => Array(pw).fill(0));
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) g[y+1][x+1] = mask[y][x];

    const neigh = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
    function traceOne(grd, sx, sy) {
      let cur=[sx,sy], prevDir=0; const pts=[]; let guard=0;
      do {
        pts.push([cur[0]-1, cur[1]-1]);
        let found=false;
        for (let i=0;i<8;i++) {
          const idx=(prevDir+i+8)%8, nx=cur[0]+neigh[idx][0], ny=cur[1]+neigh[idx][1];
          if (ny>=0&&ny<ph&&nx>=0&&nx<pw&&grd[ny][nx]) { cur=[nx,ny]; prevDir=(idx+5)%8; found=true; break; }
        }
        if (!found) break; if (++guard>20000) break;
      } while (!(cur[0]===sx && cur[1]===sy));
      return pts;
    }

    // Contour extérieur
    let sx=-1, sy=-1;
    outer: for (let y=0;y<ph;y++) for (let x=0;x<pw;x++)
      if (g[y][x] && (!g[y][x-1]||!g[y][x+1]||!g[y-1]?.[x]||!g[y+1]?.[x])) { sx=x; sy=y; break outer; }
    if (sx<0) return [];
    const contours = [traceOne(g, sx, sy)];

    // Flood fill du fond depuis le bord (pixels 0 atteignables depuis l'extérieur)
    const bg = Array.from({length:ph}, () => new Uint8Array(pw));
    const q = [[0,0]]; bg[0][0]=1;
    while (q.length) {
      const [y,x] = q.pop();
      for (const [dy,dx] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const ny=y+dy, nx=x+dx;
        if (ny>=0&&ny<ph&&nx>=0&&nx<pw&&!bg[ny][nx]&&!g[ny][nx]) { bg[ny][nx]=1; q.push([ny,nx]); }
      }
    }

    // Trouver les trous intérieurs (pixels 0 non atteints par le fond)
    const hv = Array.from({length:ph}, () => new Uint8Array(pw));
    for (let y=1;y<ph-1;y++) {
      for (let x=1;x<pw-1;x++) {
        if (!g[y][x] && !bg[y][x] && !hv[y][x]) {
          // Flood fill du trou
          const holePx = new Set();
          const hq=[[y,x]]; hv[y][x]=1;
          while (hq.length) {
            const [hy,hx] = hq.pop();
            holePx.add(hy*pw+hx);
            for (const [dy,dx] of [[0,1],[0,-1],[1,0],[-1,0]]) {
              const ny=hy+dy, nx=hx+dx;
              if (ny>0&&ny<ph-1&&nx>0&&nx<pw-1&&!hv[ny][nx]&&!g[ny][nx]&&!bg[ny][nx]) { hv[ny][nx]=1; hq.push([ny,nx]); }
            }
          }
          // Grille temporaire pour ce trou → tracé de son contour
          const tmp = Array.from({length:ph}, (_,gy) =>
            Array.from({length:pw}, (_,gx) => holePx.has(gy*pw+gx) ? 1 : 0));
          let hsx=-1, hsy=-1;
          hOuter: for (let hy=0;hy<ph;hy++) for (let hx=0;hx<pw;hx++)
            if (tmp[hy][hx] && (!tmp[hy][hx-1]||!tmp[hy][hx+1]||!tmp[hy-1]?.[hx]||!tmp[hy+1]?.[hx])) { hsx=hx; hsy=hy; break hOuter; }
          if (hsx>=0) contours.push(traceOne(tmp, hsx, hsy));
        }
      }
    }
    return contours;
  }

  /* ── Helpers géométriques ────────────────────────────────────────────── */
  function charAtGrid(grid, pt) {
    const x=Math.round(pt[0]), y=Math.round(pt[1]);
    if (y<0||y>=grid.length||x<0||x>=grid[0].length) return '.';
    return grid[y][x];
  }

  function circleThrough3(p1,p2,p3) {
    const [x1,y1]=p1,[x2,y2]=p2,[x3,y3]=p3;
    const a=x1*(y2-y3)-y1*(x2-x3)+x2*y3-x3*y2;
    if (Math.abs(a)<1e-9) return null;
    const b=(x1*x1+y1*y1)*(y3-y2)+(x2*x2+y2*y2)*(y1-y3)+(x3*x3+y3*y3)*(y2-y1);
    const c=(x1*x1+y1*y1)*(x2-x3)+(x2*x2+y2*y2)*(x3-x1)+(x3*x3+y3*y3)*(x1-x2);
    const cx=-b/(2*a), cy=-c/(2*a);
    return { cx, cy, R: Math.hypot(x1-cx, y1-cy) };
  }

  function sampleArc(circle, pStart, pEnd, hint, samples=48) {
    const {cx,cy,R} = circle;
    let da = Math.atan2(pEnd[1]-cy,pEnd[0]-cx) - Math.atan2(pStart[1]-cy,pStart[0]-cx);
    while (da<=-Math.PI) da+=2*Math.PI; while (da>Math.PI) da-=2*Math.PI;
    if (hint) {
      const a1 = Math.atan2(pStart[1]-cy, pStart[0]-cx);
      const ds = Math.hypot(cx+Math.cos(a1+da*.5)*R-hint[0], cy+Math.sin(a1+da*.5)*R-hint[1]);
      const al = a1+(da-Math.sign(da)*2*Math.PI)*.5;
      if (Math.hypot(cx+Math.cos(al)*R-hint[0], cy+Math.sin(al)*R-hint[1]) < ds) da -= Math.sign(da)*2*Math.PI;
    }
    const a1 = Math.atan2(pStart[1]-cy, pStart[0]-cx);
    return Array.from({length:samples+1}, (_,i) => [cx+Math.cos(a1+da*i/samples)*R, cy+Math.sin(a1+da*i/samples)*R]);
  }

  function sampleQuad(p0,c,p1,s=48) {
    return Array.from({length:s+1}, (_,i) => {
      const t=i/s, u=1-t;
      return [u*u*p0[0]+2*u*t*c[0]+t*t*p1[0], u*u*p0[1]+2*u*t*c[1]+t*t*p1[1]];
    });
  }

  /* ── Construction des arcs (segmentation par X) ─────────────────────── */
  function buildArcs(contour, grid) {
    let sides=[], start=null, firstX=null;
    for (let i=0;i<contour.length;i++) {
      if (charAtGrid(grid, contour[i])==='X') {
        if (start===null) { start=i; firstX=i; }
        else { sides.push({points: contour.slice(start, i+1)}); start=i; }
      }
    }
    if (start!==null && firstX!==null && start!==firstX)
      sides.push({points: [...contour.slice(start), ...contour.slice(0, firstX+1)]});
    if (!sides.length) {
      const N = Math.max(1, Math.floor(contour.length/24));
      sides = Array.from({length:N}, (_,s) => ({
        points: contour.slice(Math.floor(s*contour.length/N), Math.floor((s+1)*contour.length/N)+1)
      }));
    }
    return sides.filter(s => s.points.length>=2).map(({points:pts}) => {
      const p0=pts[0], p1=pts[pts.length-1], axis=sub(p1,p0);
      const L=vlen(axis)||1, dir=[axis[0]/L,axis[1]/L], nrm=[-dir[1],dir[0]];
      // D : segment droit si ≥2 D dans le segment, ou si un D est adjacent (rayon 1) à un X dans la grille
      const _dPts = pts.filter(p => charAtGrid(grid, p) === 'D');
      const _straight = _dPts.length >= 2 || _dPts.some(p => {
        const col=Math.round(p[0]), row=Math.round(p[1]);
        for (const [dr,dc] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]])
          if (charAtGrid(grid, [col+dc, row+dr]) === 'X') return true;
        return false;
      });
      if (_straight) return [p0, p1];
      const samps = pts
        .filter(p => { const c=charAtGrid(grid,p); return c==='O'||c==='C'||c==='X'||c==='D'; })
        .map(p => { const t=Math.max(0,Math.min(1,dot(sub(p,p0),dir)/L)); return {t, d:dot(sub(p,add(p0,mul(dir,t*L))),nrm)}; });
      if (!samps.length) {
        const mid=add(lerp(p0,p1,.5), mul(nrm,.08*L));
        const circ=circleThrough3(p0,mid,p1);
        return circ ? sampleArc(circ,p0,p1,mid,48) : sampleQuad(p0,mid,p1,48);
      }
      const ds=samps.map(s=>s.d).sort((a,b)=>a-b);
      const med=ds[Math.floor(ds.length/2)], avg=ds.reduce((a,v)=>a+Math.abs(v),0)/ds.length;
      const mag=Math.max(Math.abs(med)<.5?avg:Math.abs(med), Math.max(.02*L,.5));
      const sign=samps.reduce((a,s)=>a+Math.sign(s.d||0)*Math.abs(s.d||0),0)<0?-1:1;
      let wx=0,wy=0,ws=0;
      for (const s of samps) { const w=1-Math.abs(s.t-.5), ap=add(p0,mul(dir,s.t*L)); wx+=ap[0]*w; wy+=ap[1]*w; ws+=w; }
      const cb=ws>0?[wx/ws,wy/ws]:lerp(p0,p1,.5), cp=add(cb,mul(nrm,sign*mag));
      const circ=circleThrough3(p0,cp,p1);
      return circ ? sampleArc(circ,p0,p1,cp,64) : sampleQuad(p0,cp,p1,64);
    });
  }

  /* ── Coordonnées monde → SVG ─────────────────────────────────────────── */
  function computeBBox(pts, pad=1) {
    let minx=Infinity, miny=Infinity, maxx=-Infinity, maxy=-Infinity;
    for (const p of pts) { if(p[0]<minx)minx=p[0]; if(p[0]>maxx)maxx=p[0]; if(p[1]<miny)miny=p[1]; if(p[1]>maxy)maxy=p[1]; }
    return { minx, miny, maxx, maxy, pad };
  }

  function toSvg(p, bb) {
    const s = bb.scale != null ? bb.scale : Math.min((100-bb.pad)/(bb.maxx-bb.minx||1),(100-bb.pad)/(bb.maxy-bb.miny||1));
    return [(p[0]-bb.minx)*s, (p[1]-bb.miny)*s];
  }

  /* ── Génération du chemin SVG ────────────────────────────────────────── */
  function arcsToPath(arcs, bb) {
    let d='', first=true;
    for (const arc of arcs) {
      if (!arc.length) continue;
      const pts = arc.map(p => toSvg(p, bb));
      d += first ? `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)} ` : `L ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)} `;
      first = false;
      if (pts.length === 2) {
        d += `L ${pts[1][0].toFixed(2)} ${pts[1][1].toFixed(2)} `;
      } else {
        for (let i=1; i<pts.length; i++) {
          const c1=lerp(pts[i-1],pts[i],.33), c2=lerp(pts[i-1],pts[i],.66);
          d += `C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)} `;
        }
      }
    }
    return d + 'Z';
  }

  function catmull(pts, n=80) {
    if (pts.length<2) return pts.slice(); const out=[];
    for (let i=0;i<pts.length-1;i++) {
      const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];
      const k=Math.ceil(n/(pts.length-1));
      for (let s=0;s<k;s++) {
        const t=s/k,t2=t*t,t3=t2*t;
        out.push([p0[0]*(-.5*t3+t2-.5*t)+p1[0]*(1.5*t3-2.5*t2+1)+p2[0]*(-1.5*t3+2*t2+.5*t)+p3[0]*(.5*t3-.5*t2),
                  p0[1]*(-.5*t3+t2-.5*t)+p1[1]*(1.5*t3-2.5*t2+1)+p2[1]*(-1.5*t3+2*t2+.5*t)+p3[1]*(.5*t3-.5*t2)]);
      }
    }
    out.push(pts[pts.length-1]); return out;
  }

  function ptsToPath(pts) {
    if (!pts.length) return '';
    let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)} `;
    for (let i=1;i<pts.length;i++) {
      const c1=lerp(pts[i-1],pts[i],.33), c2=lerp(pts[i-1],pts[i],.66);
      d += `C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)} `;
    }
    return d + 'Z';
  }

  function buildLayer(grid, contours, bb) {
    let d = '';
    for (const contour of contours) {
      const arcs = buildArcs(contour, grid);
      d += arcs.length ? arcsToPath(arcs, bb) :
           contour.length >= 3 ? ptsToPath(catmull(contour.map(p => toSvg(p,bb)), Math.max(120, contour.length*3))) : '';
    }
    return d;
  }

  /* ── API publique ────────────────────────────────────────────────────── */
  /**
   * @param {Array<{ascii:string, color:string}>} layers
   *   Tableau de couches (couche 0 = arrière-plan).
   *   `color` peut être une valeur CSS directe ('#ff0') ou une variable CSS ('--ma-couleur').
   * @param {object} [options]
   *   size       {string}  — taille CSS du container  (défaut '180px')
   *   hideCursor {boolean} — masque le curseur natif   (défaut true)
   *   zIndex     {number}  — z-index                   (défaut 9999)
   *   scaleRef   {number}  — unités SVG cibles/grille  (défaut 50)
   */
  function init(layers, options = {}) {
    const size       = options.size       ?? '180px';
    const hideCursor = options.hideCursor ?? true;
    const zIndex     = options.zIndex     ?? 9999;
    const scaleRef   = options.scaleRef   ?? 50;

    const cssVars = getComputedStyle(document.documentElement);

    /* Résoudre les couleurs (variable CSS ou valeur directe) */
    const resolvedLayers = layers.map(l => ({
      ascii: l.ascii,
      color: l.color.startsWith('--') ? cssVars.getPropertyValue(l.color).trim() : l.color
    }));

    /* Injecter les styles */
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #ascii-cursor {
        position:fixed; width:${size}; height:${size};
        pointer-events:none; transform:translate(0,0);
        z-index:${zIndex}; overflow:visible; top:0; left:0;
      }
      #ascii-cursor svg { width:100%; height:100%; display:block; overflow:visible; }
      #ascii-cursor path { stroke:none; }
      ${hideCursor ? 'body { cursor:none !important; }' : ''}
    `;
    document.head.appendChild(styleEl);

    /* Injecter le div curseur */
    const cursorEl = document.createElement('div');
    cursorEl.id = 'ascii-cursor';
    cursorEl.setAttribute('aria-hidden', 'true');
    cursorEl.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"><g id="ascii-cursor-group"></g></svg>';
    document.body.appendChild(cursorEl);

    const group = document.getElementById('ascii-cursor-group');

    /* Construire les chemins SVG */
    const parsed = resolvedLayers.map(l => {
      const { grid } = parseAscii(l.ascii);
      const contours = traceAllContours(buildMask(grid));
      return { grid, contours, color: l.color };
    });

    const layer1 = parsed[0];
    const mainContour = layer1.contours[0] || [];
    const bb = mainContour.length ? computeBBox(mainContour, 1) : { minx:0,miny:0,maxx:1,maxy:1,pad:1 };
    bb.scale = scaleRef / (layer1.grid.length || 64);

    group.innerHTML = '';
    for (const { grid, contours, color } of parsed) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill',      color);
      path.setAttribute('fill-rule', 'evenodd');
      path.setAttribute('stroke',    'none');
      const d = buildLayer(grid, contours, bb);
      if (d) path.setAttribute('d', d);
      group.appendChild(path);
    }

    /* Suivi de la souris */
    window.addEventListener('mousemove', e => {
      cursorEl.style.left = e.clientX + 'px';
      cursorEl.style.top  = e.clientY + 'px';
    });
  }

  /* Exposer l'API globalement */
  global.AsciiCursor = { init };

})(window);
