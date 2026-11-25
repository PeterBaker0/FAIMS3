/*
 * Minimal dependency-free SVG charts: stacked bars and lines, with a shared
 * hover tooltip. Works from file:// (no modules, no CDN).
 */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const PAD = {top: 14, right: 16, bottom: 34, left: 68};

  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
    if (parent) parent.appendChild(el);
    return el;
  }

  function niceMax(v) {
    if (!(v > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / e;
    const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return m * e;
  }

  function niceRange(min, max) {
    const top = niceMax(Math.max(max, 0));
    const bottom = min < 0 ? -niceMax(-min) : 0;
    return [bottom, top];
  }

  function legend(container, series) {
    const lg = document.createElement('div');
    lg.className = 'chart-legend';
    series.forEach(s => {
      const item = document.createElement('span');
      item.className = 'chart-legend-item';
      const sw = document.createElement('i');
      sw.style.background = s.color;
      if (s.dash) sw.className = 'dash';
      item.appendChild(sw);
      item.appendChild(document.createTextNode(s.name));
      lg.appendChild(item);
    });
    container.appendChild(lg);
  }

  function frame(container, opts) {
    container.innerHTML = '';
    container.classList.add('chart');
    const width = Math.max(320, container.clientWidth || 800);
    const height = opts.height || 300;
    const svg = svgEl('svg', {viewBox: `0 0 ${width} ${height}`, width: '100%', height, role: 'img'}, container);
    if (opts.title) svgEl('title', {}, svg).textContent = opts.title;
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    container.appendChild(tip);
    return {svg, tip, width, height, iw: width - PAD.left - PAD.right, ih: height - PAD.top - PAD.bottom};
  }

  function axes(f, labels, yMin, yMax, fmt, opts) {
    const g = svgEl('g', {class: 'axes'}, f.svg);
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const v = yMin + ((yMax - yMin) * i) / ticks;
      const y = PAD.top + f.ih - ((v - yMin) / (yMax - yMin)) * f.ih;
      svgEl('line', {x1: PAD.left, x2: PAD.left + f.iw, y1: y, y2: y, class: v === 0 ? 'zero' : 'grid'}, g);
      const t = svgEl('text', {x: PAD.left - 8, y: y + 4, 'text-anchor': 'end', class: 'tick'}, g);
      t.textContent = fmt(v);
    }
    const n = labels.length;
    const every = Math.max(1, Math.ceil(n / Math.floor(f.iw / 56)));
    labels.forEach((lab, i) => {
      const isLast = i === n - 1;
      if (i % every !== 0 && !isLast) return;
      if (isLast && i % every !== 0 && n - 1 - Math.floor((n - 1) / every) * every < every * 0.6) return;
      const x = PAD.left + ((i + 0.5) * f.iw) / n;
      const t = svgEl('text', {x, y: PAD.top + f.ih + 18, 'text-anchor': 'middle', class: 'tick'}, g);
      t.textContent = lab;
    });
    if (opts.yLabel) {
      const t = svgEl('text', {x: 12, y: PAD.top + f.ih / 2, transform: `rotate(-90 12 ${PAD.top + f.ih / 2})`, 'text-anchor': 'middle', class: 'axis-label'}, g);
      t.textContent = opts.yLabel;
    }
  }

  function hover(f, labels, rowsFor, fmt) {
    const n = labels.length;
    const band = f.iw / n;
    const guide = svgEl('rect', {x: 0, y: PAD.top, width: band, height: f.ih, class: 'hover-band', visibility: 'hidden'}, f.svg);
    const overlay = svgEl('rect', {x: PAD.left, y: PAD.top, width: f.iw, height: f.ih, fill: 'transparent'}, f.svg);
    overlay.addEventListener('mousemove', ev => {
      const rect = f.svg.getBoundingClientRect();
      const scale = f.width / rect.width;
      const x = (ev.clientX - rect.left) * scale - PAD.left;
      const i = Math.min(n - 1, Math.max(0, Math.floor(x / band)));
      guide.setAttribute('x', PAD.left + i * band);
      guide.setAttribute('visibility', 'visible');
      const rows = rowsFor(i)
        .map(r => `<div><i style="background:${r.color}"></i>${r.name}<b>${fmt(r.value)}</b></div>`)
        .join('');
      f.tip.innerHTML = `<strong>${labels[i]}</strong>${rows}`;
      f.tip.style.display = 'block';
      const left = (PAD.left + (i + 1) * band) / scale + 12;
      const flip = left + 240 > rect.width;
      f.tip.style.left = `${flip ? (PAD.left + i * band) / scale - 252 : left}px`;
      f.tip.style.top = `${PAD.top / scale + 4}px`;
    });
    overlay.addEventListener('mouseleave', () => {
      guide.setAttribute('visibility', 'hidden');
      f.tip.style.display = 'none';
    });
  }

  function stacked(container, opts) {
    const {labels, series, fmt} = opts;
    const f = frame(container, opts);
    const n = labels.length;
    let maxPos = 0;
    let minNeg = 0;
    for (let i = 0; i < n; i++) {
      let pos = 0;
      let neg = 0;
      series.forEach(s => {
        const v = s.values[i] || 0;
        if (v >= 0) pos += v;
        else neg += v;
      });
      maxPos = Math.max(maxPos, pos);
      minNeg = Math.min(minNeg, neg);
    }
    const [yMin, yMax] = niceRange(minNeg, maxPos);
    axes(f, labels, yMin, yMax, opts.tickFmt || fmt, opts);
    const y = v => PAD.top + f.ih - ((v - yMin) / (yMax - yMin)) * f.ih;
    const band = f.iw / n;
    const bw = Math.max(1, band * (opts.barWidth || 0.78));
    const g = svgEl('g', {}, f.svg);
    for (let i = 0; i < n; i++) {
      let pos = 0;
      let neg = 0;
      const x = PAD.left + i * band + (band - bw) / 2;
      series.forEach(s => {
        const v = s.values[i] || 0;
        if (!v) return;
        let y0;
        let y1;
        if (v >= 0) {
          y0 = y(pos);
          pos += v;
          y1 = y(pos);
        } else {
          y1 = y(neg);
          neg += v;
          y0 = y(neg);
        }
        svgEl('rect', {x, y: Math.min(y0, y1), width: bw, height: Math.max(0.5, Math.abs(y0 - y1)), fill: s.color}, g);
      });
    }
    (opts.overlays || []).forEach(o => {
      const pts = o.values.map((v, i) => `${PAD.left + (i + 0.5) * band},${y(v)}`).join(' ');
      svgEl('polyline', {points: pts, fill: 'none', stroke: o.color, 'stroke-width': 2, 'stroke-dasharray': o.dash ? '5 4' : ''}, f.svg);
    });
    hover(
      f,
      labels,
      i => {
        const rows = series
          .filter(s => Math.abs(s.values[i] || 0) > 0.005)
          .map(s => ({name: s.name, color: s.color, value: s.values[i]}))
          .reverse();
        const total = series.reduce((x, s) => x + (s.values[i] || 0), 0);
        rows.push({name: 'Total', color: 'transparent', value: total});
        (opts.overlays || []).forEach(o => rows.push({name: o.name, color: o.color, value: o.values[i]}));
        return rows;
      },
      fmt
    );
    legend(container, series.concat(opts.overlays || []));
  }

  function lines(container, opts) {
    const {labels, series, fmt} = opts;
    const f = frame(container, opts);
    const n = labels.length;
    let max = 0;
    let min = 0;
    series.forEach(s => s.values.forEach(v => {
      if (v > max) max = v;
      if (v < min) min = v;
    }));
    const [yMin, yMax] = niceRange(min, max);
    axes(f, labels, yMin, yMax, opts.tickFmt || fmt, opts);
    const band = f.iw / n;
    const y = v => PAD.top + f.ih - ((v - yMin) / (yMax - yMin)) * f.ih;
    series.forEach(s => {
      const pts = s.values.map((v, i) => `${PAD.left + (i + 0.5) * band},${y(v)}`).join(' ');
      svgEl('polyline', {points: pts, fill: 'none', stroke: s.color, 'stroke-width': 2.2, 'stroke-dasharray': s.dash ? '6 4' : '', 'stroke-linejoin': 'round'}, f.svg);
      if (opts.markers) {
        s.values.forEach((v, i) => {
          if (opts.markers.includes(i)) svgEl('circle', {cx: PAD.left + (i + 0.5) * band, cy: y(v), r: 4, fill: s.color}, f.svg);
        });
      }
    });
    hover(f, labels, i => series.map(s => ({name: s.name, color: s.color, value: s.values[i]})), fmt);
    legend(container, series);
  }

  root.Charts = {stacked, lines};
})(window);
