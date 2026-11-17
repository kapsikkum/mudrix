// Rasterises the SVG nameplates that embed base64 bitmaps. CoreSVG, which actool uses, draws
// everything in an asset catalog except <image>, so those plates are composited to a PNG here.
import { deflateSync, inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SUPERSAMPLE = 3;
const FILTERS = {
  0: () => 0,
  1: (left) => left,
  2: (_, above) => above,
  3: (left, above) => (left + above) >> 1,
  4: (left, above, corner) => {
    const p = left + above - corner;
    const pa = Math.abs(p - left);
    const pb = Math.abs(p - above);
    const pc = Math.abs(p - corner);
    return pa <= pb && pa <= pc ? left : pb <= pc ? above : corner;
  },
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
  return Buffer.concat([head, data, crc]);
}

/** A PNG's pixel size, or null when the bytes are not a PNG */
export function pngSize(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** RGBA pixels as a PNG buffer */
export function pngFromRgba(rgba, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function readPng(buffer) {
  const size = pngSize(buffer);
  if (!size) throw new Error('not a PNG');
  const chunks = {};
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    (chunks[type] ??= []).push(data);
    offset += length + 12;
  }
  const header = Buffer.concat(chunks.IHDR ?? []);
  const depth = header[8];
  const type = header[9];
  if (depth !== 8 || !(type === 3 || type === 2 || type === 6)) {
    throw new Error(`unsupported PNG (depth ${depth}, colour type ${type})`);
  }
  const channels = type === 3 ? 1 : type === 2 ? 3 : 4;
  const stride = size.width * channels;
  const filtered = inflateSync(Buffer.concat(chunks.IDAT ?? []));
  const pixels = Buffer.alloc(stride * size.height);
  for (let y = 0; y < size.height; y += 1) {
    const filter = FILTERS[filtered[y * (stride + 1)]];
    if (!filter) throw new Error('unsupported PNG row filter');
    const line = filtered.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const above = y ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = above ? above[x] : 0;
      const corner = above && x >= channels ? above[x - channels] : 0;
      row[x] = (line[x] + filter(left, up, corner)) & 0xff;
    }
  }
  return { ...size, type, pixels, palette: chunks.PLTE?.[0], alpha: chunks.tRNS?.[0] };
}

function pixel(image, x, y) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
  if (image.type === 3) {
    const index = image.pixels[y * image.width + x];
    const p = index * 3;
    return [
      image.palette[p],
      image.palette[p + 1],
      image.palette[p + 2],
      image.alpha && index < image.alpha.length ? image.alpha[index] : 255,
    ];
  }
  const p = (y * image.width + x) * (image.type === 6 ? 4 : 3);
  return [
    image.pixels[p],
    image.pixels[p + 1],
    image.pixels[p + 2],
    image.type === 6 ? image.pixels[p + 3] : 255,
  ];
}

// MARK: Scene

const number = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

function attributes(raw) {
  const out = {};
  for (const [, key, value] of raw.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) out[key] = value;
  return out;
}

function tree(svg) {
  const root = { name: 'root', attrs: {}, children: [] };
  const stack = [root];
  const tags = /<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  for (const [, closing, name, raw, self] of svg.matchAll(tags)) {
    if (closing) {
      stack.pop();
      continue;
    }
    const node = { name, attrs: attributes(raw), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!self) stack.push(node);
  }
  return root.children.find((node) => node.name === 'svg') ?? null;
}

function multiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function transform(value) {
  if (!value) return [1, 0, 0, 1, 0, 0];
  let out = [1, 0, 0, 1, 0, 0];
  for (const [, name, args] of value.matchAll(/([A-Za-z]+)\(([^)]*)\)/g)) {
    const n = args
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    let step;
    if (name === 'matrix') step = n;
    else if (name === 'translate') step = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
    else if (name === 'scale') step = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
    else if (name === 'rotate') {
      const a = ((n[0] ?? 0) * Math.PI) / 180;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      step = [cos, sin, -sin, cos, n[1] ?? 0, n[2] ?? 0];
    } else throw new Error(`unsupported SVG transform: ${name}`);
    out = multiply(out, step);
  }
  return out;
}

const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function rectOf(m, width, height) {
  const corners = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ].map((p) => apply(m, p));
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function clipped(outer, inner) {
  return {
    x0: Math.max(outer.x0, inner.x0),
    y0: Math.max(outer.y0, inner.y0),
    x1: Math.min(outer.x1, inner.x1),
    y1: Math.min(outer.y1, inner.y1),
  };
}

function colour(value) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value ?? '');
  if (!hex) return null;
  const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1];
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16) / 255);
}

const ramp = (stops, t) => {
  const at = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i += 1) {
    if (at > stops[i].offset) continue;
    const from = stops[i - 1];
    const span = stops[i].offset - from.offset || 1;
    const k = (at - from.offset) / span;
    return from.colour.map((v, j) => v + (stops[i].colour[j] - v) * k);
  }
  return stops[stops.length - 1].colour;
};

function stopList(gradient) {
  return gradient.children
    .filter((node) => node.name === 'stop')
    .map((node) => {
      const offset = node.attrs.offset?.endsWith('%')
        ? number(node.attrs.offset.slice(0, -1)) / 100
        : number(node.attrs.offset);
      const rgb = colour(node.attrs['stop-color']) ?? [0, 0, 0];
      const alpha =
        node.attrs['stop-opacity'] === undefined ? 1 : number(node.attrs['stop-opacity']);
      return { offset, colour: [...rgb, alpha] };
    });
}

function gradientShader(gradient, box, matrix) {
  const stops = stopList(gradient);
  if (!stops.length) return null;
  const radial = gradient.name === 'radialGradient';
  const units = gradient.attrs.gradientUnits ?? 'objectBoundingBox';
  const toGradient = transform(gradient.attrs.gradientTransform);
  const inverse = (point) => {
    const unit =
      units === 'objectBoundingBox'
        ? [
            (point[0] - box.x0) / Math.max(1e-6, box.x1 - box.x0),
            (point[1] - box.y0) / Math.max(1e-6, box.y1 - box.y0),
          ]
        : apply(invert(multiply(matrix, toGradient)), point);
    return unit;
  };
  if (radial) {
    const cx = number(gradient.attrs.cx, 0);
    const cy = number(gradient.attrs.cy, 0);
    const r = number(gradient.attrs.r, 1);
    return (x, y) => {
      const [gx, gy] = inverse([x, y]);
      return ramp(stops, Math.hypot(gx - cx, gy - cy) / r);
    };
  }
  const x1 = number(gradient.attrs.x1, 0);
  const y1 = number(gradient.attrs.y1, 0);
  const x2 = number(gradient.attrs.x2, 1);
  const y2 = number(gradient.attrs.y2, 0);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy || 1;
  return (x, y) => {
    const [gx, gy] = inverse([x, y]);
    return ramp(stops, ((gx - x1) * dx + (gy - y1) * dy) / length);
  };
}

function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

// MARK: Paths

const ARITY = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, Z: 0 };

function flatten(d) {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const polygons = [];
  let polygon = [];
  let at = [0, 0];
  let started = [0, 0];
  let cubic = null;
  let quad = null;
  let cmd = '';
  let i = 0;
  const steps = (points) => {
    let length = 0;
    for (let k = 1; k < points.length; k += 1) {
      length += Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]);
    }
    return Math.min(64, Math.max(8, Math.ceil(length / 4)));
  };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    const upper = cmd.toUpperCase();
    const relative = cmd !== upper;
    if (upper === 'Z') {
      if (polygon.length) polygons.push(polygon);
      polygon = [];
      at = started;
      cubic = quad = null;
      continue;
    }
    if (ARITY[upper] === undefined) throw new Error(`unsupported SVG path command: ${cmd}`);
    const raw = tokens.slice(i, i + ARITY[upper]).map(Number);
    i += ARITY[upper];
    const move = relative ? at : [0, 0];
    const point = (n) => [move[0] + n[0], move[1] + n[1]];
    const add = (p) => {
      polygon.push(p);
      at = p;
    };
    if (upper === 'M') {
      if (polygon.length > 1) polygons.push(polygon);
      polygon = [];
      add(point(raw));
      started = at;
      cmd = relative ? 'l' : 'L';
      cubic = quad = null;
      continue;
    }
    if (upper === 'H') add([(relative ? at[0] : 0) + raw[0], at[1]]);
    else if (upper === 'V') add([at[0], (relative ? at[1] : 0) + raw[0]]);
    else if (upper === 'L') add(point(raw));
    else if (upper === 'C' || upper === 'S') {
      const control1 =
        upper === 'C'
          ? point(raw.slice(0, 2))
          : [2 * at[0] - (cubic?.[0] ?? at[0]), 2 * at[1] - (cubic?.[1] ?? at[1])];
      const offset = upper === 'C' ? 2 : 0;
      const control2 = point(raw.slice(offset, offset + 2));
      const end = point(raw.slice(offset + 2, offset + 4));
      const from = at;
      const count = steps([from, control1, control2, end]);
      for (let k = 1; k <= count; k += 1) {
        const t = k / count;
        const u = 1 - t;
        polygon.push([
          u * u * u * from[0] +
            3 * u * u * t * control1[0] +
            3 * u * t * t * control2[0] +
            t * t * t * end[0],
          u * u * u * from[1] +
            3 * u * u * t * control1[1] +
            3 * u * t * t * control2[1] +
            t * t * t * end[1],
        ]);
      }
      at = end;
      cubic = control2;
      quad = null;
    } else {
      const control =
        upper === 'Q'
          ? point(raw.slice(0, 2))
          : [2 * at[0] - (quad?.[0] ?? at[0]), 2 * at[1] - (quad?.[1] ?? at[1])];
      const end = point(raw.slice(upper === 'Q' ? 2 : 0, upper === 'Q' ? 4 : 2));
      const from = at;
      const count = steps([from, control, end]);
      for (let k = 1; k <= count; k += 1) {
        const t = k / count;
        const u = 1 - t;
        polygon.push([
          u * u * from[0] + 2 * u * t * control[0] + t * t * end[0],
          u * u * from[1] + 2 * u * t * control[1] + t * t * end[1],
        ]);
      }
      at = end;
      quad = control;
      cubic = null;
    }
  }
  if (polygon.length > 1) polygons.push(polygon);
  return polygons;
}

// MARK: Render

/** A still PNG of an SVG that draws embedded bitmaps (with `width`/`height` from its viewBox) */
export function rasteriseSvg(svg, width, height) {
  const root = tree(svg);
  if (!root) throw new Error('no <svg> in the nameplate');
  const numeric = (name, fallback) => number(root.attrs[name], fallback);
  const outWidth = Math.round(width ?? numeric('width', 0));
  const outHeight = Math.round(height ?? numeric('height', 0));
  if (!(outWidth > 0 && outHeight > 0)) throw new Error('the nameplate has no size');

  const scale = SUPERSAMPLE;
  const canvasWidth = outWidth * scale;
  const canvasHeight = outHeight * scale;
  const canvas = new Float32Array(canvasWidth * canvasHeight * 4);
  const gradients = {};
  const images = {};

  const collect = (node) => {
    if (node.name === 'linearGradient' || node.name === 'radialGradient') {
      gradients[node.attrs.id] = node;
    } else if (node.name === 'image' && node.attrs.id) {
      images[node.attrs.id] = node;
    }
    node.children.forEach(collect);
  };
  collect(root);

  const paint = (index, rgb, alpha) => {
    if (alpha <= 0) return;
    const rest = 1 - alpha;
    canvas[index] = rgb[0] * alpha + canvas[index] * rest;
    canvas[index + 1] = rgb[1] * alpha + canvas[index + 1] * rest;
    canvas[index + 2] = rgb[2] * alpha + canvas[index + 2] * rest;
    canvas[index + 3] = alpha + canvas[index + 3] * rest;
  };

  const shade = (value, opacity, box, matrix) => {
    if (!value || value === 'none') return null;
    const reference = /^url\(#(.+)\)$/.exec(value);
    if (reference) {
      const gradient = gradients[reference[1]];
      if (!gradient) throw new Error(`no gradient ${reference[1]}`);
      const sample = gradientShader(gradient, box, matrix);
      return (x, y) => {
        const rgba = sample(x, y);
        return [rgba[0], rgba[1], rgba[2], rgba[3] * opacity];
      };
    }
    const rgb = colour(value);
    if (!rgb) throw new Error(`unsupported SVG colour: ${value}`);
    return () => [...rgb, opacity];
  };

  const fill = (polygons, clip, shader) => {
    if (!shader || !polygons.length) return;
    let top = Infinity;
    let bottom = -Infinity;
    for (const polygon of polygons) {
      for (const point of polygon) {
        top = Math.min(top, point[1]);
        bottom = Math.max(bottom, point[1]);
      }
    }
    const from = Math.max(Math.ceil(clip.y0), Math.floor(top));
    const to = Math.min(Math.floor(clip.y1), Math.ceil(bottom));
    for (let y = from; y < to; y += 1) {
      const scan = y + 0.5;
      const crossings = [];
      for (const polygon of polygons) {
        for (let k = 0; k < polygon.length; k += 1) {
          const a = polygon[k];
          const b = polygon[(k + 1) % polygon.length];
          if (a[1] <= scan === b[1] <= scan) continue;
          crossings.push(a[0] + ((scan - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
      }
      crossings.sort((a, b) => a - b);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const start = Math.max(Math.ceil(clip.x0), Math.ceil(crossings[k] - 0.5));
        const end = Math.min(Math.ceil(clip.x1) - 1, Math.floor(crossings[k + 1] - 0.5));
        for (let x = start; x <= end; x += 1) {
          const rgba = shader(x + 0.5, y + 0.5);
          paint((y * canvasWidth + x) * 4, rgba, rgba[3]);
        }
      }
    }
  };

  const stroke = (polylines, clip, matrix, width, rgb, opacity) => {
    const radius = Math.max(0.5, (width * scale) / 2);
    const step = Math.max(0.5, radius / 2);
    const stamp = (cx, cy) => {
      const left = Math.max(Math.ceil(clip.x0), Math.floor(cx - radius));
      const right = Math.min(Math.ceil(clip.x1) - 1, Math.ceil(cx + radius));
      const top = Math.max(Math.ceil(clip.y0), Math.floor(cy - radius));
      const bottom = Math.min(Math.floor(clip.y1), Math.ceil(cy + radius));
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > radius) continue;
          paint((y * canvasWidth + x) * 4, rgb, opacity);
        }
      }
    };
    for (const line of polylines) {
      const points = line.map((point) => apply(matrix, point));
      for (let k = 1; k < points.length; k += 1) {
        const [ax, ay] = points[k - 1];
        const [bx, by] = points[k];
        const length = Math.hypot(bx - ax, by - ay);
        const count = Math.max(1, Math.ceil(length / step));
        for (let j = 0; j <= count; j += 1) {
          const t = j / count;
          stamp(ax + (bx - ax) * t, ay + (by - ay) * t);
        }
      }
    }
  };

  const ellipse = (cx, cy, rx, ry) => {
    const points = [];
    for (let k = 0; k < 64; k += 1) {
      const angle = (k / 64) * Math.PI * 2;
      points.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
    }
    return [points];
  };

  const drawImage = (node, matrix, clip) => {
    const href = node.attrs['xlink:href'] ?? node.attrs.href ?? '';
    const base64 = /^data:image\/png;base64,(.+)$/.exec(href)?.[1];
    if (!base64) throw new Error('unsupported <use> target: only base64 PNGs are drawn');
    const image = readPng(Buffer.from(base64, 'base64'));
    const x = number(node.attrs.x, 0);
    const y = number(node.attrs.y, 0);
    const bounds = clipped(clip, rectOf(matrix, image.width, image.height));
    const inverse = invert(matrix);
    const left = Math.max(0, Math.floor(bounds.x0));
    const right = Math.min(canvasWidth, Math.ceil(bounds.x1));
    const top = Math.max(0, Math.floor(bounds.y0));
    const bottom = Math.min(canvasHeight, Math.ceil(bounds.y1));
    for (let py = top; py < bottom; py += 1) {
      for (let px = left; px < right; px += 1) {
        const [u, v] = apply(inverse, [px + 0.5, py + 0.5]);
        const rgba = pixel(image, Math.floor(u - x), Math.floor(v - y));
        if (!rgba || rgba[3] === 0) continue;
        paint(
          (py * canvasWidth + px) * 4,
          rgba.map((value, index) => (index < 3 ? value / 255 : 0)),
          rgba[3] / 255
        );
      }
    }
  };

  const render = (node, state) => {
    const attrs = node.attrs;
    const matrix = multiply(state.matrix, transform(attrs.transform));
    const opacity = state.opacity * number(attrs.opacity, 1);
    const inherited = {
      ...state,
      matrix,
      opacity,
      fill: attrs.fill ?? state.fill,
      stroke: attrs.stroke ?? state.stroke,
      strokeWidth: number(attrs['stroke-width'], state.strokeWidth),
    };
    if (node.name === 'defs' || node.name === 'style' || node.name === 'stop') return;
    if (node.name === 'linearGradient' || node.name === 'radialGradient') return;
    if (node.name === 'svg') {
      const nested = state.clip !== null && node !== root;
      if (!nested) {
        node.children.forEach((child) => render(child, inherited));
        return;
      }
      const box = node.attrs.viewBox
        ?.trim()
        .split(/[\s,]+/)
        .map(Number);
      const viewWidth = number(attrs.width, box?.[2] ?? 0);
      const viewHeight = number(attrs.height, box?.[3] ?? 0);
      const placed = multiply(matrix, [1, 0, 0, 1, number(attrs.x, 0), number(attrs.y, 0)]);
      const mapped =
        box && box.length === 4
          ? multiply(placed, [viewWidth / box[2], 0, 0, viewHeight / box[3], 0, 0])
          : placed;
      const clip = clipped(
        inherited.clip,
        rectOf(mapped, box?.[2] ?? viewWidth, box?.[3] ?? viewHeight)
      );
      node.children.forEach((child) => render(child, { ...inherited, matrix: mapped, clip }));
      return;
    }
    if (node.name === 'g') {
      node.children.forEach((child) => render(child, inherited));
      return;
    }
    if (node.name === 'use') {
      const href = node.attrs['xlink:href'] ?? node.attrs.href ?? '';
      const target = images[href.replace(/^#/, '')];
      if (!target) throw new Error(`missing <use> target ${href}`);
      drawImage(target, inherited.matrix, inherited.clip);
      return;
    }
    if (node.name === 'image') return;
    if (node.name === 'rect') {
      const width = number(attrs.width);
      const height = number(attrs.height);
      const corner = rectOf(inherited.matrix, width, height);
      const shape = [
        [
          [0, 0],
          [width, 0],
          [width, height],
          [0, height],
        ].map((point) => apply(inherited.matrix, point)),
      ];
      const parentOpacity = opacity * (attrs.class?.split(/\s+/).includes('f') ? 0.75 : 1);
      fill(shape, inherited.clip, shade(inherited.fill, parentOpacity, corner, inherited.matrix));
      return;
    }
    if (node.name === 'circle' || node.name === 'ellipse') {
      const cx = number(attrs.cx);
      const cy = number(attrs.cy);
      const rx = node.name === 'circle' ? number(attrs.r) : number(attrs.rx);
      const ry = node.name === 'circle' ? number(attrs.r) : number(attrs.ry);
      const corner = rectOf(inherited.matrix, rx * 2, ry * 2);
      const shape = ellipse(cx, cy, rx, ry).map((polygon) =>
        polygon.map((point) => apply(inherited.matrix, point))
      );
      const parentOpacity = opacity * (attrs.class?.split(/\s+/).includes('f') ? 0.75 : 1);
      fill(shape, inherited.clip, shade(inherited.fill, parentOpacity, corner, inherited.matrix));
      return;
    }
    if (node.name === 'path') {
      const lines = flatten(attrs.d ?? '');
      const transformed = lines.map((line) => line.map((point) => apply(inherited.matrix, point)));
      const xs = transformed.flat().map((point) => point[0]);
      const ys = transformed.flat().map((point) => point[1]);
      const corner = {
        x0: Math.min(...xs),
        y0: Math.min(...ys),
        x1: Math.max(...xs),
        y1: Math.max(...ys),
      };
      if (inherited.fill && inherited.fill !== 'none') {
        fill(transformed, inherited.clip, shade(inherited.fill, opacity, corner, inherited.matrix));
      }
      if (inherited.stroke && inherited.stroke !== 'none') {
        const rgb = colour(inherited.stroke);
        stroke(lines, inherited.clip, inherited.matrix, inherited.strokeWidth, rgb, opacity);
      }
      return;
    }
    throw new Error(`unsupported SVG element: ${node.name}`);
  };

  const bounds = {
    x0: 0,
    y0: 0,
    x1: canvasWidth,
    y1: canvasHeight,
  };
  render(root, {
    matrix: [scale, 0, 0, scale, 0, 0],
    fill: '#000000',
    stroke: null,
    strokeWidth: 1,
    opacity: 1,
    clip: bounds,
  });

  const rgba = Buffer.alloc(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y += 1) {
    for (let x = 0; x < outWidth; x += 1) {
      const sums = [0, 0, 0, 0];
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const index = ((y * scale + sy) * canvasWidth + x * scale + sx) * 4;
          for (let k = 0; k < 4; k += 1) sums[k] += canvas[index + k];
        }
      }
      const alpha = sums[3] / (scale * scale);
      const out = (y * outWidth + x) * 4;
      rgba[out + 3] = Math.round(Math.min(1, alpha) * 255);
      for (let k = 0; k < 3; k += 1) {
        rgba[out + k] = alpha > 0 ? Math.round(Math.min(1, sums[k] / sums[3]) * 255) : 0;
      }
    }
  }
  return pngFromRgba(rgba, outWidth, outHeight);
}
