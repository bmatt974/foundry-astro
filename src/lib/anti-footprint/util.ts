/**
 * Shared helpers for the anti-footprint layer. Pure functions
 * with no theme-specific logic — theme configs import what they
 * need, the `mimic-cms-assets` build script imports the same
 * primitives so HTML rendering and post-build file emission stay
 * in lockstep.
 */
import zlib from 'node:zlib';

/**
 * Cheap deterministic 32-bit hash. Good enough for uniform
 * bucketing — not for crypto. Same seed → same number every run.
 */
export function favHash(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

/**
 * Deterministic pick from a list. Drives every "per-hostname
 * variant" in the network: generator strings, head profiles,
 * favicon styles, URL templates.
 */
export function pickFromList<T>(options: readonly T[], seed: string): T {
    return options[favHash(seed) % options.length];
}

/**
 * Reduce a hostname to a slug-safe label suitable for URL paths
 * (e.g. as a "custom theme name" claim). Strips port, lowercases,
 * drops everything after the first dot, sanitises remaining
 * characters.
 *
 *   site-a.foundry-astro.test → 'site-a'
 *   visit-rome.com            → 'visit-rome'
 */
export function hostnameLabel(host: string): string {
    const noPort = host.split(':')[0];
    const firstLabel = noPort.split('.')[0].toLowerCase();
    return firstLabel.replace(/[^a-z0-9-]/g, '');
}

/**
 * Convert HSL to RGB. Used by every favicon generator that picks
 * its colour from a hash.
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    h /= 360;
    s /= 100;
    l /= 100;
    if (s === 0) {
        const v = Math.round(l * 255);
        return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (t: number): number => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    return [
        Math.round(hue2rgb(h + 1 / 3) * 255),
        Math.round(hue2rgb(h) * 255),
        Math.round(hue2rgb(h - 1 / 3) * 255),
    ];
}

/**
 * Build a 32×32 identicon PNG for the hostname. Horizontally
 * mirrored 5×5 grid (GitHub-style) — always reads as "designed"
 * rather than a generated solid square. Different hostnames land
 * on different patterns AND colours.
 */
export function makeIdenticon(hostname: string, size = 32): Buffer {
    const hash = favHash(hostname);
    const hue = hash % 360;
    const fg = hslToRgb(hue, 65, 45);
    const bg = hslToRgb(hue, 30, 92);

    const grid: boolean[][] = [];
    for (let row = 0; row < 5; row++) {
        const cells: boolean[] = [];
        for (let col = 0; col < 3; col++) {
            cells.push(((hash >> (row * 3 + col)) & 1) === 1);
        }
        cells.push(cells[1]);
        cells.push(cells[0]);
        grid.push(cells);
    }

    const cellSize = Math.floor(size / 5);
    const totalSize = cellSize * 5;
    const rowBytes = 1 + totalSize * 3;
    const rawData = Buffer.alloc(rowBytes * totalSize);
    for (let y = 0; y < totalSize; y++) {
        rawData[y * rowBytes] = 0;
        for (let x = 0; x < totalSize; x++) {
            const cellRow = Math.min(4, Math.floor(y / cellSize));
            const cellCol = Math.min(4, Math.floor(x / cellSize));
            const colour = grid[cellRow][cellCol] ? fg : bg;
            const off = y * rowBytes + 1 + x * 3;
            rawData[off] = colour[0];
            rawData[off + 1] = colour[1];
            rawData[off + 2] = colour[2];
        }
    }
    return encodePng(rawData, totalSize, totalSize);
}

/**
 * Wrap raw row data (filter byte per row + RGB pixels) into a
 * valid PNG. Used by the identicon generator and any future
 * algorithmic favicon style.
 */
export function encodePng(rawData: Buffer, width: number, height: number): Buffer {
    const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2; // RGB
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    const idat = zlib.deflateSync(rawData);
    return Buffer.concat([
        signature,
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', idat),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function crc32(buf: Buffer): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc = crc ^ buf[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
