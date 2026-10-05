'use strict';

/**
 * ============================================================================
 *  NIXSTYLE 1.0 - a style engine for NIXCODE message builders
 * ============================================================================
 *  Same functions. Same payloads. Fourteen completely different personalities.
 *
 *  WHAT IT ADDS ON TOP OF NIXCODE 5.0
 *  ----------------------------------
 *  1. THEMES .......... one content model rendered as NEON, TERMINAL, GLASS,
 *                       NEWSPAPER, ARCADE, BRUTALIST, DOSSIER, HUD, ZEN,
 *                       RETRO, CYBERDECK, MINIMAL, LOUD, KPOP. Each theme
 *                       restyles headings, tables, meters, buttons, cards.
 *  2. ART ............. 30 pure text-art generators (sparkline, bar chart,
 *                       box tables, trees, kanban, leaderboards, invoices,
 *                       heat bars, diffs, countdowns, meters, badges).
 *  3. COMPOSER ........ `styled(client, 'NEON')` - one chainable object that
 *                       renders the same call differently per theme.
 *  4. PERFECTION ...... Preflight.inspect() audits a builder, Preflight.repair()
 *                       fixes it (button overflow, long bodies, wide tables,
 *                       unbalanced markdown, empty media, duplicate ids...),
 *                       and safeSend() retries then downgrades rich -> buttons
 *                       -> plain text so a message ALWAYS lands.
 *
 *  Everything is non-destructive: the 5.0 builders keep working untouched.
 * ========================================================================== */

const path = require('path');

/* ---------------------------------------------------------------------------
 * CORE LOADER
 * ------------------------------------------------------------------------- */

const CORE_CANDIDATES = [
    process.env.NIXCODE_CORE,
    './nixcode.js',
    './settings/MessageBuilderNew.js',
    './settings/nixcode.js',
    path.join(__dirname, 'nixcode.js'),
    path.join(__dirname, 'settings', 'MessageBuilderNew.js')
].filter(Boolean);

function loadCore() {
    const errors = [];

    for (const candidate of CORE_CANDIDATES) {
        try {
            const core = require(candidate);

            if (core && typeof core.AIRich === 'function' && typeof core.Button === 'function') return core;

            errors.push(`${candidate} -> loaded but is not a NIXCODE build`);
        } catch (error) {
            errors.push(`${candidate} -> ${error.message}`);
        }
    }

    throw new Error(['NIXSTYLE could not locate the NIXCODE core library.', 'Tried:', ...errors, 'Set NIXCODE_CORE=/absolute/path/to/MessageBuilderNew.js'].join('\n'));
}

const CORE = loadCore();

const { AIRich, Button, ButtonV2, Carousel, List, Poll, Event, Album, Toolkit, Text, LIMITS, MessageQueue } = CORE;

const VERSION = '1.0';
const CODENAME = 'Prism';

/* ---------------------------------------------------------------------------
 * ART - pure text-art generators (no media, no network, just characters)
 * ------------------------------------------------------------------------- */

const WIDE_CHAR = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]|[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{2B00}-\u{2BFF}]|[\u{1F000}-\u{1F2FF}]/u;

const EMOJI_JOINER = /[\u200d\ufe0f]/g;

class Art {
    constructor() {}

    /** Approximate display width - wide glyphs and emoji count as 2 columns. */
    static w(value) {
        const str = String(value ?? '').replace(EMOJI_JOINER, '');

        let total = 0;

        for (const char of str) {
            total += WIDE_CHAR.test(char) ? 2 : 1;
        }

        return total;
    }

    static pad(value, width, { align = 'left', fill = ' ' } = {}) {
        const str = String(value ?? '');
        const missing = Math.max(0, width - Art.w(str));

        if (align === 'right') return fill.repeat(missing) + str;
        if (align === 'center') {
            const left = Math.floor(missing / 2);

            return fill.repeat(left) + str + fill.repeat(missing - left);
        }

        return str + fill.repeat(missing);
    }

    static center(value, width, options = {}) {
        return Art.pad(value, width, { ...options, align: 'center' });
    }

    static truncate(value, max, suffix = '…') {
        const str = String(value ?? '');

        if (Art.w(str) <= max) return str;

        let out = '';
        let used = 0;

        for (const char of str) {
            const size = WIDE_CHAR.test(char) ? 2 : 1;

            if (used + size > max - Art.w(suffix)) break;

            out += char;
            used += size;
        }

        return out + suffix;
    }

    static truncateMiddle(value, max, ellipsis = '…') {
        const str = String(value ?? '');

        if (Art.w(str) <= max) return str;

        const keep = Math.max(2, max - 1);
        const head = Math.ceil(keep / 2);
        const tail = Math.floor(keep / 2);

        let left = '';
        let usedL = 0;

        for (const char of str) {
            if (usedL + 1 > head) break;
            left += char;
            usedL++;
        }

        let right = '';
        let usedR = 0;

        for (const char of [...str].reverse()) {
            if (usedR + 1 > tail) break;
            right = char + right;
            usedR++;
        }

        return left + ellipsis + right;
    }

    static wrap(value, width = 32, { indent = '', breakWords = true } = {}) {
        const lines = [];

        for (const paragraph of String(value ?? '').split('\n')) {
            let current = '';

            for (const word of paragraph.split(' ')) {
                const candidate = current ? `${current} ${word}` : word;

                if (Art.w(candidate) <= width || !current) {
                    if (Art.w(candidate) > width && breakWords) {
                        if (current) {
                            lines.push(indent + current);
                            current = '';
                        }

                        let chunk = '';

                        for (const char of word) {
                            if (Art.w(chunk + char) > width) {
                                lines.push(indent + chunk);
                                chunk = '';
                            }

                            chunk += char;
                        }

                        current = chunk;
                    } else {
                        current = candidate;
                    }
                } else {
                    lines.push(indent + current);
                    current = word;
                }
            }

            lines.push(indent + current);
        }

        return lines.join('\n');
    }

    static repeat(char, count) {
        return String(char).repeat(Math.max(0, count));
    }

    static rule(width = 24, char = '─') {
        return Art.repeat(char, width);
    }

    /** ▁▂▃▄▅▆▇█ */
    static sparkline(values, { blocks = '▁▂▃▄▅▆▇█', min, max } = {}) {
        const list = (values || []).map(Number).filter(Number.isFinite);

        if (!list.length) return '';

        const lo = min !== undefined ? min : Math.min(...list);
        const hi = max !== undefined ? max : Math.max(...list);
        const span = hi - lo || 1;

        return list
            .map((value) => {
                const index = Math.round(((value - lo) / span) * (blocks.length - 1));

                return blocks[Math.max(0, Math.min(blocks.length - 1, index))];
            })
            .join('');
    }

    /** Horizontal bar chart as text. */
    static barChart(rows = [], { width = 16, filled = '█', empty = '░', showValue = true, unit = '', labelWidth, gap = ' ' } = {}) {
        const list = (Array.isArray(rows) ? rows : [rows]).map((row) => (Array.isArray(row) ? { label: row[0], value: Number(row[1]) || 0 } : row));

        if (!list.length) return '';

        const max = Math.max(...list.map((row) => Math.abs(Number(row.value) || 0)), 1);
        const labelSize = labelWidth ?? Math.max(...list.map((row) => Art.w(row.label)));

        return list
            .map((row) => {
                const value = Number(row.value) || 0;
                const filledCount = Math.max(0, Math.round((Math.abs(value) / max) * width));
                const bar = Art.repeat(filled, filledCount) + Art.repeat(empty, width - filledCount);
                const tail = showValue ? ` ${value}${unit}` : '';

                return `${Art.pad(row.label, labelSize)} ${gap}${bar}${tail}`;
            })
            .join('\n');
    }

    /** Vertical bar chart, one column per value. */
    static columns(values = [], { height = 5, filled = '█', empty = ' ', baseline = '─' } = {}) {
        const list = (values || []).map((v) => (Array.isArray(v) ? Number(v[1]) || 0 : Number(v) || 0));

        if (!list.length) return '';

        const max = Math.max(...list, 1);

        const lines = [];

        for (let level = height; level >= 1; level--) {
            lines.push(
                list
                    .map((value) => {
                        const cell = Math.round((value / max) * height);

                        return cell >= level ? filled : empty;
                    })
                    .join(' ')
            );
        }

        lines.push(Art.repeat(baseline, list.length * 2 - 1));

        return lines.join('\n');
    }

    /** ▓▓▓▓▓░░░░░  50% */
    static progress(value, max = 100, { width = 12, filled = '█', empty = '░', showPercent = true } = {}) {
        const safeMax = Number(max) || 100;
        const ratio = Math.max(0, Math.min(1, (Number(value) || 0) / safeMax));
        const filledCount = Math.round(ratio * width);
        const bar = Art.repeat(filled, filledCount) + Art.repeat(empty, width - filledCount);

        return showPercent ? `${bar} ${String(Math.round(ratio * 100)).padStart(3)}%` : bar;
    }

    /** ●●●●○○○○○○ */
    static dots(value, max = 100, { width = 10, filled = '●', empty = '○' } = {}) {
        const ratio = Math.max(0, Math.min(1, (Number(value) || 0) / (Number(max) || 100)));
        const count = Math.round(ratio * width);

        return Art.repeat(filled, count) + Art.repeat(empty, width - count);
    }

    /** ★★★★☆ */
    static stars(value, max = 5, { filled = '★', empty = '☆', half = '⯪' } = {}) {
        const safeMax = Math.max(1, Number(max) || 5);
        const score = Math.max(0, Math.min(safeMax, Number(value) || 0));
        const full = Math.floor(score);
        const hasHalf = score - full >= 0.5;

        return Art.repeat(filled, full) + (hasHalf ? half : '') + Art.repeat(empty, Math.max(0, safeMax - full - (hasHalf ? 1 : 0)));
    }

    /** 🟩🟩🟩⬜ - squared heat bar. */
    static heat(value, max = 100, { width = 10, on = '🟩', off = '⬜' } = {}) {
        const ratio = Math.max(0, Math.min(1, (Number(value) || 0) / (Number(max) || 100)));

        return Art.repeat(on, Math.round(ratio * width)) + Art.repeat(off, width - Math.round(ratio * width));
    }

    /** ██ 12,480 - compact metric line. */
    static meter(value, max, { width = 8, filled = '▰', empty = '▱', label = '' } = {}) {
        const ratio = Math.max(0, Math.min(1, (Number(value) || 0) / (Number(max) || 1)));
        const bar = Art.repeat(filled, Math.round(ratio * width)) + Art.repeat(empty, width - Math.round(ratio * width));

        return `${bar}${label ? ' ' + label : ''}`;
    }

    /* ---------------- tables ---------------- */

    /** ╔══════╦══════╗ box-drawing table. */
    static boxTable(rows = [], { padding = 1, charset = 'light', align = 'left', header = true } = {}) {
        const sets = {
            light: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│', cross: '┼', top: '┬', bottom: '┴', left: '├', right: '┤' },
            heavy: { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃', cross: '╋', top: '┳', bottom: '┻', left: '┣', right: '┫' },
            double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║', cross: '╬', top: '╦', bottom: '╩', left: '╠', right: '╣' },
            ascii: { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|', cross: '+', top: '+', bottom: '+', left: '+', right: '+' },
            ghost: { tl: ' ', tr: ' ', bl: ' ', br: ' ', h: '─', v: ' ', cross: '─', top: '─', bottom: '─', left: '─', right: '─' },
            dots: { tl: '·', tr: '·', bl: '·', br: '·', h: '·', v: ':', cross: '·', top: '·', bottom: '·', left: '·', right: '·' }
        };

        const set = sets[charset] || sets.light;

        const grid = (rows || []).map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : [String(row ?? '')]));

        if (!grid.length) return '';

        const columns = Math.max(...grid.map((row) => row.length));
        const widths = new Array(columns).fill(0);

        for (const row of grid) {
            for (let i = 0; i < columns; i++) {
                widths[i] = Math.max(widths[i], Art.w(row[i] ?? ''));
            }
        }

        const pad = ' '.repeat(Math.max(0, padding));

        const line = (left, mid, right, fill) => left + widths.map((width) => Art.repeat(fill, width + padding * 2)).join(mid) + right;

        const render = (row) => set.v + widths.map((width, i) => pad + Art.pad(row[i] ?? '', width, { align: i === 0 ? align : 'left' }) + pad).join(set.v) + set.v;

        const out = [line(set.tl, set.top, set.tr, set.h)];

        grid.forEach((row, index) => {
            out.push(render(row));

            if (header && index === 0 && grid.length > 1) out.push(line(set.left, set.cross, set.right, set.h));
        });

        out.push(line(set.bl, set.bottom, set.br, set.h));

        return out.join('\n');
    }

    /** label │ value   (markdown-ish piped table). */
    static pipeTable(rows = [], { header = true, separator = '│', align = 'left' } = {}) {
        const grid = (rows || []).map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : [String(row ?? '')]));

        if (!grid.length) return '';

        const columns = Math.max(...grid.map((row) => row.length));
        const widths = new Array(columns).fill(0);

        for (const row of grid) {
            for (let i = 0; i < columns; i++) widths[i] = Math.max(widths[i], Art.w(row[i] ?? ''));
        }

        const out = [];

        grid.forEach((row, index) => {
            out.push(widths.map((width, i) => Art.pad(row[i] ?? '', width, { align: i === 0 ? align : 'left' })).join(` ${separator} `));

            if (header && index === 0) out.push(widths.map((width) => Art.repeat('─', width)).join('─┼─'));
        });

        return out.join('\n');
    }

    /** key : value list with aligned colons. */
    static kvList(pairs = {}, { separator = ':', align = 'left', bullet = '', gap = 1, sort = false } = {}) {
        const entries = Array.isArray(pairs) ? pairs.map((pair) => [pair.key ?? pair[0], pair.value ?? pair[1]]) : Object.entries(pairs);

        if (!entries.length) return '';

        const list = sort ? [...entries].sort((a, b) => String(a[0]).localeCompare(String(b[0]))) : entries;
        const width = Math.max(...list.map(([key]) => Art.w(key)));

        return list
            .map(([key, value]) => `${bullet ? bullet + ' ' : ''}${Art.pad(key, width, { align })}${separator} ${value}`)
            .join('\n');
    }

    /** Rows of pills:  ‹ fast › ‹ stable › */
    static badges(items = [], { open = '‹', close = '›', sep = ' ' } = {}) {
        return (Array.isArray(items) ? items : [items]).map((item) => `${open} ${item} ${close}`).join(sep);
    }

    static tags(items = [], { prefix = '#' } = {}) {
        return (Array.isArray(items) ? items : [items]).map((item) => `${prefix}${String(item).replace(/\s+/g, '_')}`).join(' ');
    }

    /** Home › Shop › Panels */
    static breadcrumb(items = [], { sep = ' › ' } = {}) {
        return (Array.isArray(items) ? items : [items]).join(sep);
    }

    /* ---------------- structures ---------------- */

    /** Nested tree from a plain object / array. */
    static tree(node, { indent = '', branch = '├─ ', last = '└─ ', pipe = '│  ', space = '   ' } = {}) {
        const walk = (value, prefix, isLast, isRoot) => {
            const label = isRoot ? '' : prefix + (isLast ? last : branch) + value.label;

            const lines = label ? [label] : [];

            const children = value.children ?? [];

            children.forEach((child, index) => {
                const childLast = index === children.length - 1;

                lines.push(...walk(child, isRoot ? '' : prefix + (isLast ? space : pipe), childLast, false));
            });

            return lines;
        };

        const normalized = Array.isArray(node)
            ? { label: '', children: node.map((item) => (typeof item === 'string' ? { label: item } : item)) }
            : { label: node.label ?? '', children: (node.children || []).map((item) => (typeof item === 'string' ? { label: item } : item)) };

        const rootLine = normalized.label ? [normalized.label] : [];

        return [...rootLine, ...(normalized.children || []).flatMap((child, index) => walk(child, '', index === normalized.children.length - 1, false))].join('\n');
    }

    /** Side-by-side columns (kanban board). */
    static kanban(columns = [], { width = 16, gap = '  ', bullet = '•', headerRule = '─' } = {}) {
        const cols = (columns || []).map((column) => ({
            title: String(column.title ?? ''),
            items: (column.items ?? []).map((item) => (typeof item === 'string' ? item : item.text ?? item.title ?? String(item)))
        }));

        if (!cols.length) return '';

        const height = Math.max(...cols.map((column) => column.items.length), 1);

        const out = [];

        out.push(cols.map((column) => Art.center(Art.truncate(column.title, width), width)).join(gap));
        out.push(cols.map(() => Art.repeat(headerRule, width)).join(gap));

        for (let row = 0; row < height; row++) {
            out.push(
                cols
                    .map((column) => {
                        const item = column.items[row];

                        return item ? Art.pad(Art.truncate(`${bullet} ${item}`, width), width) : Art.pad('', width);
                    })
                    .join(gap)
            );
        }

        return out.join('\n').replace(/[ \t]+$/gm, '');
    }

    /** 🥇 Gold · 🥈 Silver · 🥉 Bronze then 4. 5. */
    static leaderboard(items = [], { medals = ['🥇', '🥈', '🥉'], showBars = true, width = 10 } = {}) {
        const list = (Array.isArray(items) ? items : [items]).map((item) => (Array.isArray(item) ? { label: item[0], value: Number(item[1]) || 0 } : item));

        if (!list.length) return '';

        const max = Math.max(...list.map((item) => Number(item.value) || 0), 1);
        const labelWidth = Math.max(...list.map((item) => Art.w(item.label)));

        return list
            .map((item, index) => {
                const rank = medals[index] ?? `${index + 1}.`;
                const bar = showBars ? ' ' + Art.repeat('▰', Math.max(1, Math.round(((Number(item.value) || 0) / max) * width))) : '';

                return `${rank} ${Art.pad(item.label, labelWidth)} ${String(item.value).padStart(6)}${bar}`;
            })
            .join('\n');
    }

    /** 7 → 12 (+5) */
    static diff(from, to, { up = '▲', down = '▼', flat = '■', suffix = '' } = {}) {
        const a = Number(from) || 0;
        const b = Number(to) || 0;
        const delta = b - a;
        const arrow = delta > 0 ? up : delta < 0 ? down : flat;

        return `${a}${suffix} → ${b}${suffix} (${delta > 0 ? '+' : ''}${delta}) ${arrow}`;
    }

    /** 2d 04h 11m 09s from milliseconds. */
    static countdown(ms = 0, { parts = 3 } = {}) {
        let rest = Math.max(0, Math.floor(Number(ms) / 1000));

        const units = [
            ['d', 86400],
            ['h', 3600],
            ['m', 60],
            ['s', 1]
        ];

        const out = [];

        for (const [label, size] of units) {
            const value = Math.floor(rest / size);

            rest -= value * size;

            if (value || out.length) out.push(`${String(value).padStart(2, '0')}${label}`);
        }

        return out.slice(0, parts).join(' ');
    }

    /* ---------------- formatting ---------------- */

    static num(value, { decimals = 0, locale = 'en-KE' } = {}) {
        return Number(value || 0).toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }

    static money(value, { currency = 'KES', decimals = 0, compact = false } = {}) {
        const amount = Number(value) || 0;

        if (compact && Math.abs(amount) >= 1000) {
            const units = [
                [1e9, 'B'],
                [1e6, 'M'],
                [1e3, 'K']
            ];

            for (const [size, suffix] of units) {
                if (Math.abs(amount) >= size) return `${currency} ${(amount / size).toFixed(1).replace(/\.0$/, '')}${suffix}`;
            }
        }

        return `${currency} ${Art.num(amount, { decimals })}`;
    }

    static ordinal(value) {
        const n = Number(value) || 0;
        const mod100 = n % 100;

        if (mod100 >= 11 && mod100 <= 13) return `${n}th`;

        return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
    }

    static percent(value, total, { decimals = 0, signed = false } = {}) {
        const ratio = (Number(total) || 0) === 0 ? 0 : ((Number(value) || 0) / Number(total)) * 100;
        const text = `${ratio.toFixed(decimals)}%`;

        return signed && ratio > 0 ? `+${text}` : text;
    }

    static bytes(value, decimals = 1) {
        return Toolkit.formatBytes(value, decimals);
    }

    static duration(seconds) {
        return Toolkit.formatDuration(seconds);
    }

    /** Balanced-markdown sanitation: closes dangling bold / italic / strike markers. */
    static balanceMarkdown(value) {
        let text = String(value ?? '');

        const pairs = [
            ['```', (text.match(/```/g) || []).length],
            ['`', (text.replace(/```/g, '').match(/`/g) || []).length],
            ['*', (text.match(/\*/g) || []).length],
            ['_', (text.match(/_/g) || []).length],
            ['~', (text.match(/~/g) || []).length]
        ];

        for (const [marker, count] of pairs) {
            if (count % 2 === 1) text += marker;
        }

        return text;
    }

    static stripMarkdown(value) {
        return String(value ?? '')
            .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ''))
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/_([^_]+)_/g, '$1')
            .replace(/~([^~]+)~/g, '$1')
            .replace(/\|\|([^|]+)\|\|/g, '$1');
    }
}

/* ---------------------------------------------------------------------------
 * THEMES - 14 personalities for the same content
 * ------------------------------------------------------------------------- */

const ICON_SETS = {
    neon: { ok: '◉', warn: '▲', error: '✖', info: 'ℹ', loading: '◌', bullet: '▸', dot: '•', arrow: '→' },
    terminal: { ok: '[OK]', warn: '[WARN]', error: '[ERR]', info: '[i]', loading: '[...]', bullet: '-', dot: '*', arrow: '->' },
    glass: { ok: '✓', warn: '!', error: '✕', info: 'i', loading: '…', bullet: '·', dot: '·', arrow: '→' },
    paper: { ok: '✓', warn: '!', error: '✗', info: 'i', loading: '…', bullet: '-', dot: '•', arrow: '→' },
    arcade: { ok: '♥', warn: '!', error: 'X', info: '?', loading: '…', bullet: '►', dot: '·', arrow: '»' },
    brutal: { ok: 'OK', warn: 'WARN', error: 'ERROR', info: 'NOTE', loading: 'WAIT', bullet: '—', dot: '■', arrow: '→' },
    dossier: { ok: 'CONFIRMED', warn: 'CAUTION', error: 'BREACH', info: 'INTEL', loading: 'PENDING', bullet: '§', dot: '·', arrow: '»' },
    hud: { ok: '▲', warn: '△', error: '✖', info: '◈', loading: '⟳', bullet: '»', dot: '∙', arrow: '→' },
    zen: { ok: '○', warn: '△', error: '✕', info: '◌', loading: '◍', bullet: '‣', dot: '·', arrow: '→' },
    retro: { ok: '✔', warn: '▲', error: '✘', info: 'i', loading: '…', bullet: '›', dot: '·', arrow: '→' },
    cyber: { ok: '▣', warn: '⚠', error: '⛔', info: '◇', loading: '◐', bullet: '›', dot: '·', arrow: '‣' },
    minimal: { ok: 'ok', warn: '!', error: '!', info: 'i', loading: '…', bullet: '—', dot: '·', arrow: '→' },
    loud: { ok: '✅', warn: '⚠️', error: '❌', info: '💡', loading: '⏳', bullet: '🔥', dot: '•', arrow: '➜' },
    kpop: { ok: '💜', warn: '💛', error: '💔', info: '✨', loading: '🎧', bullet: '⭐', dot: '·', arrow: '➜' }
};

/**
 * Every theme exposes the same hook surface, so the composer can stay dumb:
 *   title(text), footer(text), heading(text, level), divider(label),
 *   text(text), quote(text, author), note(text), status(kind, text),
 *   table(rows), kv(pairs), list(items), chips(items), progress(value,max),
 *   rating(value,max), stat(items), card(...), buttons(items)
 */
const THEMES = {
    NEON: {
        id: 'NEON',
        label: 'Neon Grid',
        blurb: 'Cyberpunk wireframe with block glyphs',
        icons: ICON_SETS.neon,
        upper: false,
        tableStyle: 'box',
        boxCharset: 'heavy',
        progressStyle: 'bar',
        ratingStyle: 'stars',
        bullet: '▸',
        heading: (text, level = 1) => `${'▌'.repeat(Math.max(1, 4 - level))} *${text}*`,
        divider: (label) => `▬▬▬ ${label ? label + ' ' : ''}${'▬'.repeat(Math.max(2, 18 - (label ? label.length : 0)))}`,
        title: (text) => `◤ ${String(text).toUpperCase()} ◢`,
        statusPrefix: (kind, icons) => `${icons[kind]}`,
        tags: 'neon'
    },
    TERMINAL: {
        id: 'TERMINAL',
        label: 'Terminal',
        blurb: 'Monospace shell output, ASCII tables',
        icons: ICON_SETS.terminal,
        upper: true,
        tableStyle: 'box',
        boxCharset: 'ascii',
        progressStyle: 'bar',
        ratingStyle: 'stars',
        bullet: '-',
        heading: (text, level = 1) => `${'#'.repeat(level)} ${String(text)}`,
        divider: (label) => `---- ${label ? label + ' ' : ''}${'-'.repeat(Math.max(2, 20 - (label ? label.length : 0)))}`,
        title: (text) => `$ ${String(text)}`,
        statusPrefix: (kind, icons) => icons[kind],
        tags: 'terminal'
    },
    GLASS: {
        id: 'GLASS',
        label: 'Glass',
        blurb: 'Airy, minimal, generous whitespace',
        icons: ICON_SETS.glass,
        upper: false,
        tableStyle: 'pipe',
        progressStyle: 'dots',
        ratingStyle: 'stars',
        bullet: '·',
        heading: (text, level = 1) => (level === 1 ? `✦ ${text}` : `  ${text}`),
        divider: (label) => `${'·'.repeat(3)} ${label ?? ''} ${'·'.repeat(14)}`.replace(/\s+$/, ''),
        title: (text) => String(text),
        statusPrefix: (kind, icons) => icons[kind],
        tags: 'quiet'
    },
    PAPER: {
        id: 'PAPER',
        label: 'Newspaper',
        blurb: 'Editorial columns, rules and datelines',
        icons: ICON_SETS.paper,
        upper: false,
        tableStyle: 'pipe',
        progressStyle: 'bar',
        ratingStyle: 'stars',
        bullet: '—',
        heading: (text, level = 1) => (level === 1 ? `*${String(text).toUpperCase()}*` : `_${text}_`),
        divider: (label) => `${'═'.repeat(6)} ${label ?? ''} ${'═'.repeat(12)}`.replace(/\s+$/, ''),
        title: (text) => `— ${String(text)} —`,
        statusPrefix: (kind, icons) => icons[kind],
        tags: 'paper'
    },
    ARCADE: {
        id: 'ARCADE',
        label: 'Arcade 8-bit',
        blurb: 'Retro cabinet energy, hearts and arrows',
        icons: ICON_SETS.arcade,
        upper: true,
        tableStyle: 'box',
        boxCharset: 'double',
        progressStyle: 'blocks',
        ratingStyle: 'hearts',
        bullet: '►',
        heading: (text, level = 1) => `${'★'.repeat(Math.max(1, 4 - level))} ${String(text).toUpperCase()}`,
        divider: (label) => `▚▚ ${label ? label.toUpperCase() + ' ' : ''}${'▚'.repeat(12)}`,
        title: (text) => `▶ ${String(text).toUpperCase()} ◀`,
        statusPrefix: (kind, icons) => icons[kind],
        tags: 'arcade'
    },
    BRUTAL: {
        id: 'BRUTAL',
        label: 'Brutalist',
        blurb: 'Loud type, hard edges, zero decoration',
        icons: ICON_SETS.brutal,
        upper: true,
        tableStyle: 'box',
        boxCharset: 'heavy',
        progressStyle: 'bar',
        ratingStyle: 'blocks',
        bullet: '—',
        heading: (text, level = 1) => `${String(text).toUpperCase()}${level === 1 ? ' //' : ''}`,
        divider: (label) => `${'█'.repeat(2)} ${label ? String(label).toUpperCase() : 'SECTION'} ${'█'.repeat(14)}`,
        title: (text) => String(text).toUpperCase(),
        statusPrefix: (kind, icons) => `${icons[kind]}:`,
        tags: 'brutal'
    },
    DOSSIER: {
        id: 'DOSSIER',
        label: 'Dossier',
        blurb: 'Classified file, stamped and indexed',
        icons: ICON_SETS.dossier,
        upper: true,
        tableStyle: 'pipe',
        progressStyle: 'bar',
        ratingStyle: 'stars',
        bullet: '§',
        heading: (text, level = 1) => `${level === 1 ? '§ 1.' : '§'} ${String(text).toUpperCase()}`,
        divider: (label) => `┄┄┄ ${label ? `FILE: ${String(label).toUpperCase()}` : 'CLASSIFIED'} ┄┄┄`,
        title: (text) => `╢ ${String(text).toUpperCase()} ╟`,
        statusPrefix: (kind, icons) => `${icons[kind]}`,
        tags: 'dossier'
    },
    HUD: {
        id: 'HUD',
        label: 'HUD',
        blurb: 'Tactical overlay, brackets and readouts',
        icons: ICON_SETS.hud,
        upper: false,
        tableStyle: 'box',
        boxCharset: 'ghost',
        progressStyle: 'meter',
        ratingStyle: 'dots',
        bullet: '»',
        heading: (text, level = 1) => `[ ${String(text)} ]${level === 1 ? ' ⟨ACTIVE⟩' : ''}`,
        divider: (label) => `⟨${'─'.repeat(3)} ${label ?? 'SYS'} ${'─'.repeat(12)}⟩`,
        title: (text) => `◈ ${String(text)}`,
        statusPrefix: (kind, icons) => `[${icons[kind]}]`,
        tags: 'hud'
    },
    ZEN: {
        id: 'ZEN',
        label: 'Zen',
        blurb: 'Calm, lowercase, single accent',
        icons: ICON_SETS.zen,
        upper: false,
        tableStyle: 'ghost',
        progressStyle: 'dots',
        ratingStyle: 'circles',
        bullet: '‣',
        heading: (text, level = 1) => `${level === 1 ? '◦ ' : '  '}${String(text).toLowerCase()}`,
        divider: (label) => `◦${'·'.repeat(2)} ${label ? String(label).toLowerCase() : ''} ${'·'.repeat(16)}`.replace(/\s+$/, ''),
        title: (text) => String(text).toLowerCase(),
        statusPrefix: (kind, icons) => icons[kind],
        tags: 'zen'
    },
    RETRO: {
        id: 'RETRO',
        label: 'Retro 90s',
        blurb: 'CD-ROM era, asterisks and underlines',
        icons: ICON_SETS.retro,
        upper: false,
        tableStyle: 'box',
        boxCharset: 'ascii',
        progressStyle: 'blocks',
        ratingStyle: 'stars',
        bullet: '›',
        heading: (text, level = 1) => `${level === 1 ? '*** ' : '** '}${String(text)}${level === 1 ? ' ***' : ' **'}`,
        divider: (label) => `*~*~* ${label ?? ''} *~*~*`.replace(/\s+/g, ' ').trim(),
        title: (text) => `╭☆ ${String(text)} ☆╮`,
        statusPrefix: (kind, icons) => icons[kind],
        tags: 'retro'
    },
    CYBER: {
        id: 'CYBER',
        label: 'Cyberdeck',
        blurb: 'Data-terminal with dense readouts',
        icons: ICON_SETS.cyber,
        upper: false,
        tableStyle: 'box',
        boxCharset: 'double',
        progressStyle: 'heat',
        ratingStyle: 'dots',
        bullet: '›',
        heading: (text, level = 1) => `${'▓▒░'.slice(0, Math.max(1, 3 - level))} ${String(text)}`,
        divider: (label) => `░▒▓ ${label ?? 'DATA'} ▓▒░`,
        title: (text) => `▚▚ ${String(text)} ▞▞`,
        statusPrefix: (kind, icons) => `${icons[kind]}`,
        tags: 'cyber'
    },
    MINIMAL: {
        id: 'MINIMAL',
        label: 'Minimal',
        blurb: 'Almost no decoration at all',
        icons: ICON_SETS.minimal,
        upper: false,
        tableStyle: 'pipe',
        progressStyle: 'bar',
        ratingStyle: 'stars',
        bullet: '',
        heading: (text) => String(text),
        divider: () => '',
        title: (text) => String(text),
        statusPrefix: (kind, icons) => icons[kind],
        tags: 'minimal'
    },
    LOUD: {
        id: 'LOUD',
        label: 'Loud',
        blurb: 'Maximum emoji, maximum energy',
        icons: ICON_SETS.loud,
        upper: false,
        tableStyle: 'box',
        boxCharset: 'heavy',
        progressStyle: 'heat',
        ratingStyle: 'flames',
        bullet: '🔥',
        heading: (text, level = 1) => `${level === 1 ? '🚀' : '✨'} ${String(text)}`,
        divider: (label) => `🔥 ${label ? String(label).toUpperCase() : 'HOT'} ${'🔥'.repeat(6)}`,
        title: (text) => `⚡ ${String(text)} ⚡`,
        statusPrefix: (kind, icons) => icons[kind],
        tags: 'loud'
    },
    KPOP: {
        id: 'KPOP',
        label: 'Fanlight',
        blurb: 'Pastel hearts, sparkles and fandom energy',
        icons: ICON_SETS.kpop,
        upper: false,
        tableStyle: 'pipe',
        progressStyle: 'dots',
        ratingStyle: 'hearts',
        bullet: '⭐',
        heading: (text, level = 1) => `${level === 1 ? '💫' : '✧'} ${String(text)}`,
        divider: (label) => `💜 ${label ?? 'stream'} ${'💜'.repeat(6)}`,
        title: (text) => `♡ ${String(text)} ♡`,
        statusPrefix: (kind, icons) => icons[kind],
        tags: 'kpop'
    }
};

function themeIds() {
    return Object.keys(THEMES);
}

function resolveTheme(id) {
    if (!id) return THEMES.NEON;

    const key = String(id).toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (THEMES[key]) return THEMES[key];

    const fuzzy = Object.values(THEMES).find((theme) => theme.id === key || theme.label.toUpperCase().replace(/[^A-Z0-9]/g, '') === key || theme.id.startsWith(key));

    return fuzzy || null;
}

function themeInfo() {
    return Object.values(THEMES).map((theme) => ({ id: theme.id, label: theme.label, blurb: theme.blurb }));
}

/* ---------------------------------------------------------------------------
 * FRAMES - themed text boxes (used by composer.box())
 * ------------------------------------------------------------------------- */

const FRAMES = {
    light: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│', left: '├', right: '┤' },
    heavy: { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃', left: '┣', right: '┫' },
    double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║', left: '╠', right: '╣' },
    ascii: { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|', left: '+', right: '+' },
    round: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│', left: '├', right: '┤' },
    ghost: { tl: ' ', tr: ' ', bl: ' ', br: ' ', h: '─', v: ' ', left: '─', right: '─' },
    dots: { tl: '·', tr: '·', bl: '·', br: '·', h: '·', v: ':', left: '·', right: '·' }
};

function frameText(title = '', lines = [], { charset = 'light', width, padding = 1 } = {}) {
    const set = FRAMES[charset] || FRAMES.light;

    const body = (Array.isArray(lines) ? lines : [lines]).filter((line) => line !== undefined && line !== null);

    const inner = width ?? Math.max(Art.w(title), ...body.map((line) => Art.w(line)), 12);

    const pad = ' '.repeat(Math.max(0, padding));

    const top = set.tl + Art.repeat(set.h, inner + padding * 2) + set.tr;
    const bottom = set.bl + Art.repeat(set.h, inner + padding * 2) + set.br;

    const out = [top];

    if (title) {
        out.push(set.v + pad + Art.pad(Art.truncate(title, inner), inner) + pad + set.v);
        out.push(set.left + Art.repeat(set.h, inner + padding * 2) + set.right);
    }

    for (const line of body) {
        for (const chunk of Art.wrap(line, inner).split('\n')) {
            out.push(set.v + pad + Art.pad(chunk, inner) + pad + set.v);
        }
    }

    out.push(bottom);

    return out.join('\n');
}

/* ---------------------------------------------------------------------------
 * STYLED MESSAGE - the composer
 * ------------------------------------------------------------------------- */

class StyledMessage {
    constructor(client, themeId = 'NEON', { title, footer, dynamic = true, unsupportedTypeAlert = false, boxCharset, balanceMarkdown = true } = {}) {
        const theme = resolveTheme(themeId);

        if (!theme) {
            throw new Error(`Unknown theme "${themeId}". Available: ${themeIds().join(', ')}`);
        }

        this.theme = theme;
        this.client = client;
        this.balanceMarkdown = balanceMarkdown !== false;
        this.boxCharset = boxCharset || theme.boxCharset || 'light';

        this.rich = new AIRich(client, { dynamic, unsupportedTypeAlert });

        this._plain = [];
        this.stats = { sections: 0, tables: 0, media: 0, chars: 0, buttons: 0 };

        if (title) this.title(title);
        if (footer) this.footer(footer);
    }

    get icons() {
        return this.theme.icons;
    }

    /* ---------------- internals ---------------- */

    _push(kind, section, submessage, plain) {
        if (section) {
            this.rich.addSection(section);
            this.stats.sections++;
        }

        if (plain !== undefined) this._plain.push(plain);
        if (plain !== undefined) this.stats.chars += Art.w(String(plain));

        return this;
    }

    /** Adds a text primitive carrying themed markdown. */
    _text(markdown, plain) {
        const text = this.balanceMarkdown ? Art.balanceMarkdown(markdown) : markdown;

        this.rich.addText(text);

        this.stats.sections++;
        this._plain.push(plain !== undefined ? plain : Art.stripMarkdown(text));
        this.stats.chars += Art.w(String(plain !== undefined ? plain : text));

        return this;
    }

    /* ---------------- chrome ---------------- */

    title(text) {
        this.rich.setTitle(this.theme.title(text));
        this._plain.unshift(this.theme.title(text));

        return this;
    }

    footer(text) {
        this.rich.setFooter(this.theme.footer ? this.theme.footer(text) : text);

        return this;
    }

    heading(text, { level = 1 } = {}) {
        return this._text(this.theme.heading(text, level), `${'#'.repeat(level)} ${text}`);
    }

    divider(label = '') {
        const line = this.theme.divider ? this.theme.divider(label) : '';

        if (!line) return this;

        return this._text(line, Art.repeat('-', 20));
    }

    spacer() {
        return this._text('\u200b', '');
    }

    text(value, options = {}) {
        return this._text(value, options.plain);
    }

    paragraph(value) {
        return this.text(value);
    }

    accent(value) {
        const mark = this.theme.id === 'LOUD' || this.theme.id === 'KPOP' ? '*' : '_';

        return this._text(Text.format(value, ['bold']));
    }

    quote(value, { author = '' } = {}) {
        const bar = this.theme.id === 'DOSSIER' ? '▌' : this.theme.id === 'HUD' ? '⟩' : '│';

        const lines = String(value)
            .split('\n')
            .map((line) => `${bar} ${line}`)
            .join('\n');

        return this._text(lines + (author ? `\n${bar} — _${author}_` : ''), `> ${value}${author ? ` — ${author}` : ''}`);
    }

    note(value) {
        return this._text(`${this.icons.info} ${value}`, value);
    }

    ok(value) {
        return this._text(`${this.icons.ok} ${value}`, value);
    }

    warn(value) {
        return this._text(`${this.icons.warn} ${value}`, value);
    }

    error(value) {
        return this._text(`${this.icons.error} ${value}`, value);
    }

    loading(value = 'working…') {
        return this._text(`${this.icons.loading} ${value}`, value);
    }

    /** Framed text box - the "crazy" showpiece. */
    box(title, lines, { charset } = {}) {
        const frame = frameText(title, Array.isArray(lines) ? lines : String(lines).split('\n'), {
            charset: charset || this.boxCharset
        });

        return this._text('```\n' + frame + '\n```', [title, ...(Array.isArray(lines) ? lines : [lines])].join('\n'));
    }

    code(language, source) {
        this.rich.addCode(language, source);
        this.stats.sections++;

        return this._text(`(${language} snippet)`, source);
    }

    /* ---------------- data ---------------- */

    kv(pairs, { separator = ':', bullet = this.theme.bullet, sort = false } = {}) {
        const text = Art.kvList(pairs, { separator, bullet, sort });

        return this._text(text, text);
    }

    table(rows, { native = false, charset, align = 'left', keywords = true } = {}) {
        const grid = (rows || []).map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : [String(row ?? '')]));

        if (!grid.length) return this;

        this.stats.tables++;

        if (native) {
            this.rich.addTable(grid);
            this.stats.sections++;

            return this._text(`(native table · ${grid.length - 1} rows)`, grid.map((row) => row.join(' | ')).join('\n'));
        }

        let rendered;

        if (this.theme.tableStyle === 'box') rendered = Art.boxTable(grid, { charset: charset || this.boxCharset, align });
        else if (this.theme.tableStyle === 'ghost') rendered = Art.boxTable(grid, { charset: 'ghost', align });
        else rendered = Art.pipeTable(grid, { align });

        return this._text('```\n' + rendered + '\n```', grid.map((row) => row.join('  ')).join('\n'));
    }

    list(items, { ordered = false, title = '' } = {}) {
        const list = Array.isArray(items) ? items : [items];

        const bullet = this.theme.bullet === '' ? '' : `*${this.theme.bullet}*`;

        const lines = list.map((item, index) => (ordered ? `*${index + 1}.* ${item}` : bullet ? `${bullet} ${item}` : `${item}`));

        const text = [title ? `*${title}*` : '', ...lines].filter(Boolean).join('\n');

        return this._text(text, text);
    }

    chips(items, { type = 'badges' } = {}) {
        const text = type === 'tags' ? Art.tags(items) : Art.badges(items);

        return this._text(text, String([].concat(items).join(' · ')));
    }

    tags(items) {
        return this.chips(items, { type: 'tags' });
    }

    breadcrumb(items) {
        const text = Art.breadcrumb(items, { sep: this.theme.id === 'HUD' ? ' ▸ ' : ' › ' });

        return this._text(text, text);
    }

    progress(value, max = 100, label = '') {
        const style = this.theme.progressStyle;

        let bar;

        if (style === 'dots') bar = Art.dots(value, max, { width: 12 });
        else if (style === 'heat') bar = Art.heat(value, max, { width: 10 });
        else if (style === 'meter') bar = Art.meter(value, max, { width: 10 });
        else if (style === 'blocks') bar = Art.progress(value, max, { width: 12, filled: '▰', empty: '▱' });
        else bar = Art.progress(value, max, { width: 12 });

        const text = `${label ? `*${label}* ` : ''}${bar}`;

        return this._text(text, `${label} ${Art.percent(value, max)}`);
    }

    rating(value, max = 5, label = '') {
        let stars;

        switch (this.theme.ratingStyle) {
            case 'hearts':
                stars = Art.stars(value, max, { filled: '❤', empty: '♡', half: '♥' });
                break;
            case 'flames':
                stars = Art.stars(value, max, { filled: '🔥', empty: '▫', half: '🔥' });
                break;
            case 'circles':
                stars = Art.dots(value, max, { width: max, filled: '●', empty: '○' });
                break;
            case 'blocks':
                stars = Art.stars(value, max, { filled: '▰', empty: '▱', half: '▰' });
                break;
            case 'dots':
                stars = Art.dots(value, max, { width: max * 2, filled: '◆', empty: '◇' });
                break;
            default:
                stars = Art.stars(value, max);
        }

        const text = `${label ? `*${label}* ` : ''}${stars} ${value}/${max}`;

        return this._text(text, text);
    }

    stat(items, { width = 8 } = {}) {
        const list = (Array.isArray(items) ? items : [items]).map((item) => (Array.isArray(item) ? { label: item[0], value: item[1] } : item));

        if (!list.length) return this;

        const max = Math.max(...list.map((item) => Math.abs(Number(item.value) || 0)), 1);
        const labelWidth = Math.max(...list.map((item) => Art.w(item.label)));

        const lines = list.map((item) => {
            const bar = Art.meter(item.value, max, { width });

            return `${Art.pad(item.label, labelWidth)} ${bar} *${item.value}*${item.delta ? ` ${item.delta}` : ''}`;
        });

        const text = lines.join('\n');

        return this._text(text, text);
    }

    /** ▁▂▃▄▅▆▇█ trend line. */
    sparkline(values, { label = '', width } = {}) {
        const line = label ? `${label}: ${Art.sparkline(values)}` : Art.sparkline(values);

        return this._text(line, line);
    }

    barChart(rows, { label = '', width = 14, unit = '' } = {}) {
        const chart = Art.barChart(rows, { width, unit });
        const block = label ? `*${label}*\n\`\`\`\n${chart}\n\`\`\`` : '```\n' + chart + '\n```';

        return this._text(block, label + '\n' + chart);
    }

    columns(values, { label = '', height = 5 } = {}) {
        const chart = Art.columns(values, { height });
        const block = label ? `*${label}*\n\`\`\`\n${chart}\n\`\`\`` : '```\n' + chart + '\n```';

        return this._text(block, label + '\n' + chart);
    }

    leaderboard(items, { label = '' } = {}) {
        const table = Art.leaderboard(items);
        const block = label ? `*${label}*\n\`\`\`\n${table}\n\`\`\`` : '```\n' + table + '\n```';

        return this._text(block, label + '\n' + table);
    }

    kanban(columns, { label = '' } = {}) {
        const board = Art.kanban(columns);
        const block = label ? `*${label}*\n\`\`\`\n${board}\n\`\`\`` : '```\n' + board + '\n```';

        return this._text(block, label + '\n' + board);
    }

    tree(node, { label = '' } = {}) {
        const rendered = Art.tree(node);
        const block = label ? `*${label}*\n\`\`\`\n${rendered}\n\`\`\`` : '```\n' + rendered + '\n```';

        return this._text(block, label + '\n' + rendered);
    }

    countdown(ms, { label = 'expires in' } = {}) {
        const text = `${label}: *${Art.countdown(ms)}*`;

        return this._text(text, text);
    }

    diff(from, to, { label = '', suffix = '' } = {}) {
        const text = `${label ? label + ' ' : ''}${Art.diff(from, to, { suffix })}`;

        return this._text(text, text);
    }

    money(value, { currency = 'KES', decimals = 0, compact = false, label = '' } = {}) {
        const text = `${label ? label + ': ' : ''}*${Art.money(value, { currency, decimals, compact })}*`;

        return this._text(text, text);
    }

    steps(items, { current = null } = {}) {
        const list = Array.isArray(items) ? items : [items];

        const lines = list.map((item, index) => {
            const label = typeof item === 'string' ? item : item.title ?? item.label ?? '';

            const state = current === null ? '○' : index < current ? this.icons.ok : index === current ? '◉' : '○';

            return `${state} ${index + 1}. ${label}`;
        });

        const text = lines.join('\n');

        return this._text(text, text);
    }

    timeline(items) {
        const list = (Array.isArray(items) ? items : [items]).map((item) => ({
            time: item.time ?? item.timestamp ?? '',
            title: item.title ?? item.text ?? '',
            description: item.description ?? ''
        }));

        const timeWidth = Math.max(...list.map((item) => Art.w(item.time)), 1);

        const text = list
            .map((item) => `${Art.pad(item.time, timeWidth)} ${this.icons.dot} *${item.title}*${item.description ? `\n${' '.repeat(timeWidth + 3)}${item.description}` : ''}`)
            .join('\n');

        return this._text(text, text);
    }

    todo(items, { label = '' } = {}) {
        const list = (Array.isArray(items) ? items : [items]).map((item) => (typeof item === 'string' ? { text: item, done: false } : item));

        const text = [label ? `*${label}*` : '', ...list.map((item) => `${item.done ? '☑' : '☐'} ${item.text}`)].filter(Boolean).join('\n');

        return this._text(text, text);
    }

    accordion(items, { label = '' } = {}) {
        const list = (Array.isArray(items) ? items : [items]).map((item) => ({
            title: item.title ?? '',
            content: item.content ?? item.body ?? ''
        }));

        const text = [label ? `*${label}*` : '', ...list.map((item) => `${this.icons.bullet} *${item.title}*\n   ${item.content}`)].filter(Boolean).join('\n');

        return this._text(text, text);
    }

    compare(left, right, { leftLabel = 'A', rightLabel = 'B' } = {}) {
        const columns = [
            { title: leftLabel, items: Array.isArray(left) ? left : Object.values(left) },
            { title: rightLabel, items: Array.isArray(right) ? right : Object.values(right) }
        ];

        return this.kanban(columns);
    }

    /* ---------------- media ---------------- */

    image(url, options = {}) {
        this.rich.addImage(url, options);
        this.stats.sections++;
        this.stats.media++;

        return this;
    }

    gallery(urls, { width = 300, height = 300 } = {}) {
        return this.image(urls, { width, height });
    }

    video(url, options = {}) {
        this.rich.addVideo(url, options);
        this.stats.sections++;
        this.stats.media++;

        return this;
    }

    banner(options = {}) {
        this.rich.addBanner(options);
        this.stats.sections++;
        this.stats.media++;

        return this;
    }

    product(options = {}) {
        this.rich.addProduct(options);
        this.stats.sections++;

        return this;
    }

    source(list) {
        this.rich.addSource(list);
        this.stats.sections++;

        return this;
    }

    link({ url, title = '', description = '' } = {}) {
        this.rich.addLinkPreview({ url, title, description });
        this.stats.sections++;

        return this;
    }

    document(options = {}) {
        this.rich.addDocument(options);
        this.stats.sections++;

        return this;
    }

    audio(options = {}) {
        this.rich.addAudio(options);
        this.stats.sections++;

        return this;
    }

    widget(data, options = {}) {
        this.rich.addWidget(data, options);
        this.stats.sections++;

        return this;
    }

    /** Card = image + heading + body + optional actions, one call. */
    card({ image, title, subtitle = '', body = '', footer = '', actions = [] } = {}) {
        if (image) this.image(image, { width: 300, height: 300 });
        if (title) this.heading(title, { level: 2 });
        if (subtitle) this._text(`_${subtitle}_`, subtitle);
        if (body) this.text(body);
        if (footer) this._text(`${this.icons.dot} ${footer}`, footer);

        if (actions.length) this.actions(actions);

        return this;
    }

    /* ---------------- actions / buttons ---------------- */

    actions(items, { title = '', layout } = {}) {
        const list = Array.isArray(items) ? items : [items];

        this.rich.addActionButtons(
            list.map((item, index) => (typeof item === 'string' ? { label: item, tool_call_id: String(index) } : item)),
            { title, layout }
        );

        this.stats.sections++;
        this.stats.buttons += list.length;

        return this;
    }

    suggest(items, options = {}) {
        this.rich.addSuggest(items, options);
        this.stats.sections++;

        return this;
    }

    /* ---------------- output ---------------- */

    raw() {
        return this.rich;
    }

    /** Applies a transform to the underlying AIRich (escape hatch). */
    tap(callback) {
        callback(this.rich, this);

        return this;
    }

    size() {
        return this.rich.length;
    }

    preview() {
        return {
            theme: this.theme.id,
            label: this.theme.label,
            sections: this.rich.length,
            tables: this.stats.tables,
            media: this.stats.media,
            stats: this.rich.statistics()
        };
    }

    toPlainText() {
        return [this.rich._title, ...this._plain, this.rich._footer].filter(Boolean).join('\n\n');
    }

    async toPayload(jid, options = {}) {
        return this.rich.toPayload(jid, options);
    }

    async build(jid, options = {}) {
        return this.rich.build(jid, options);
    }

    async send(jid, options = {}) {
        return this.rich.send(jid, options);
    }

    async preflight(options = {}) {
        const { target, applied, report } = await Preflight.repair(this.rich, options);

        this.rich = target;

        return { applied, report };
    }

    async safeSend(jid, options = {}) {
        return safeSend(this.rich, jid, { ...options, plainText: this.toPlainText() });
    }
}

/* ---------------------------------------------------------------------------
 * BUTTON TEXT STYLES - same function, wildly different labels
 * ------------------------------------------------------------------------- */

const EMOJI_STRIP = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;

const BUTTON_GLYPHS = ['►', '◆', '●', '■', '▲', '★', '✦', '❖', '⬟', '◈'];

const BUTTON_STYLES = {
    plain: (label) => String(label),

    emoji: (label, index) => `${BUTTON_GLYPHS[index % BUTTON_GLYPHS.length]} ${label}`,

    caps: (label) => String(label).toUpperCase(),

    lowercase: (label) => String(label).toLowerCase(),

    minimal: (label) => String(label).replace(EMOJI_STRIP, '').replace(/\s+/g, ' ').trim(),

    numbered: (label, index) => `${index + 1}. ${label}`,

    arrow: (label) => `${String(label).replace(EMOJI_STRIP, '').trim()} →`,

    boxed: (label) => `[ ${label} ]`,

    verbose: (label) => `${label}  »`,

    short: (label) => Art.truncate(String(label).replace(EMOJI_STRIP, '').trim(), 16),

    decorated: (label, index, theme) => `${theme.icons.bullet} ${label} ${theme.icons.arrow}`,

    terminal: (label) => `./${String(label).replace(EMOJI_STRIP, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,

    question: (label) => `${String(label).replace(EMOJI_STRIP, '').trim()}?`
};

function applyButtonStyle(style, label, index = 0, theme = THEMES.NEON) {
    const fn = BUTTON_STYLES[style] || BUTTON_STYLES.plain;

    const value = String(fn(label, index, theme) ?? label);

    return Art.truncate(value, 24);
}

/**
 * StyledButtons - the Button builder, dressed by a theme + button style.
 * Overflow replies are folded into a single_select automatically.
 */
class StyledButtons {
    constructor(client, { theme = 'NEON', buttonStyle = 'emoji', autoTrim = true, visibleLimit = LIMITS.visibleButtons } = {}) {
        this.theme = resolveTheme(theme) || THEMES.NEON;
        this.buttonStyle = buttonStyle;
        this.autoTrim = autoTrim !== false;
        this.visibleLimit = visibleLimit;

        this.button = new Button(client);
        this._count = 0;
        this._plain = [];
    }

    get icons() {
        return this.theme.icons;
    }

    title(text) {
        this.button.setTitle(this.theme.title(text));
        this._plain.unshift(text);

        return this;
    }

    body(text) {
        this.button.setBody(text);

        return this;
    }

    footer(text) {
        this.button.setFooter(text);

        return this;
    }

    _label(text) {
        const styled = applyButtonStyle(this.buttonStyle, text, this._count, this.theme);

        this._count++;
        this._plain.push(text);

        return styled;
    }

    _plainLabel() {
        return this._plain.join(' · ');
    }

    reply(label, id = '') {
        this.button.addReply(this._label(label), id);

        return this;
    }

    url(label, link, webview = false) {
        this.button.addUrl(this._label(label), link, webview);

        return this;
    }

    copy(label, code) {
        this.button.addCopy(this._label(label), code);

        return this;
    }

    call(label, number) {
        this.button.addCall(this._label(label), number);

        return this;
    }

    reminder(label, id) {
        this.button.addReminder(this._label(label), id);

        return this;
    }

    location(options = {}) {
        this.button.addLocation(options);
        this._plain.push('location');

        return this;
    }

    flow(options) {
        this.button.addFlow({ ...options, flow_cta: this._label(options?.flow_cta || options?.display_text || 'Open') });

        return this;
    }

    selection(title, options = {}) {
        this.button.addSelection(this.theme.upper ? String(title).toUpperCase() : title, options);

        return this;
    }

    section(title, highlight = '') {
        this.button.makeSection(this.theme.upper ? String(title).toUpperCase() : title, highlight);

        return this;
    }

    row(header, title, description, id) {
        this.button.makeRow(header, title, description, id);

        return this;
    }

    image(path, options = {}) {
        this.button.setImage(path, options);

        return this;
    }

    thumbnail(path) {
        this.button.setThumbnail(path);

        return this;
    }

    /** Fold any overflow of visible buttons into a dropdown. */
    trim(options = {}) {
        const result = Preflight.repairButton(this.button, { visible: this.visibleLimit, ...options });

        this.button = result.target;

        return this;
    }

    count() {
        return this.button.count();
    }

    validate() {
        return this.button.validate();
    }

    raw() {
        return this.button;
    }

    toPlainText() {
        return [this._plain[0], this._plainLabel()].filter(Boolean).join('\n');
    }

    async send(jid, options = {}) {
        const target = this.autoTrim ? this.trim().button : this.button;

        return target.send(jid, options);
    }

    async safeSend(jid, options = {}) {
        const target = this.autoTrim ? this.trim().button : this.button;

        return safeSend(target, jid, { ...options, plainText: this.toPlainText() });
    }
}

/* ---------------------------------------------------------------------------
 * STYLED CAROUSEL / LIST / POLL
 * ------------------------------------------------------------------------- */

class StyledCarousel {
    constructor(client, { theme = 'NEON', cardStyle = 'photo', autoTrim = true } = {}) {
        this.theme = resolveTheme(theme) || THEMES.NEON;
        this.cardStyle = cardStyle;
        this.autoTrim = autoTrim !== false;
        this.carousel = new Carousel(client);
        this._plain = [];
    }

    body(text) {
        this.carousel.setBody(text);

        return this;
    }

    footer(text) {
        this.carousel.setFooter(text);

        return this;
    }

    async addCard({ image, title = '', subtitle = '', body = '', footer = '', buttons = [], params = {} } = {}) {
        const styled = this._styleCard({ title, subtitle, body, footer });

        const list = buttons.map((button, index) => {
            if (typeof button === 'string') {
                return {
                    name: 'quick_reply',
                    params: { display_text: applyButtonStyle('decorated', button, index, this.theme), id: button }
                };
            }

            const params$ = { ...(button.params || button.buttonParamsJson || {}) };

            if (params$.display_text) params$.display_text = applyButtonStyle('decorated', params$.display_text, index, this.theme);

            return { name: button.name || 'quick_reply', params: params$ };
        });

        this._plain.push(styled.title || title);

        if (image) {
            await this.carousel.addImageCard({ image, ...styled, buttons: list, params });
        } else {
            throw new Error('StyledCarousel.addCard requires an image');
        }

        return this;
    }

    _styleCard({ title, subtitle, body, footer }) {
        switch (this.cardStyle) {
            case 'poster':
                return {
                    title: String(title).toUpperCase(),
                    subtitle,
                    body: `*${String(title).toUpperCase()}*\n${body}`,
                    footer: footer
                };
            case 'ticket':
                return {
                    title: `${this.theme.icons.bullet} ${title}`,
                    subtitle,
                    body: `${body}\n${Art.repeat('─', 12)}`,
                    footer: `${footer} ${this.theme.icons.arrow}`
                };
            case 'terminal':
                return {
                    title: `$ ${title}`,
                    subtitle,
                    body: '```\n' + Art.wrap(body, 26) + '\n```',
                    footer: `[${footer}]`
                };
            case 'quote':
                return {
                    title,
                    subtitle: subtitle ? `_${subtitle}_` : '',
                    body: String(body)
                        .split('\n')
                        .map((line) => `│ ${line}`)
                        .join('\n'),
                    footer
                };
            default:
                return { title, subtitle, body, footer };
        }
    }

    count() {
        return this.carousel.count();
    }

    validate() {
        return this.carousel.validate();
    }

    raw() {
        return this.carousel;
    }

    toPlainText() {
        return this._plain.filter(Boolean).join('\n');
    }

    async send(jid, options = {}) {
        return this.carousel.send(jid, options);
    }

    async safeSend(jid, options = {}) {
        return safeSend(this.carousel, jid, { ...options, plainText: this.toPlainText() });
    }
}

class StyledList {
    constructor(client, { theme = 'NEON', rowStyle = 'aligned' } = {}) {
        this.theme = resolveTheme(theme) || THEMES.NEON;
        this.rowStyle = rowStyle;
        this.list = new List(client);
        this._plain = [];
        this._index = 0;
    }

    title(text) {
        this.list.setTitle(this.theme.title(text));

        return this;
    }

    body(text) {
        this.list.setBody(text);

        return this;
    }

    footer(text) {
        this.list.setFooter(text);

        return this;
    }

    button(text) {
        this.list.setButtonText(this.theme.upper ? String(text).toUpperCase() : text);

        return this;
    }

    section(title) {
        this.list.addSection(this.theme.upper ? String(title).toUpperCase() : title);

        return this;
    }

    row(title, description = '', id = '') {
        this._index++;

        const label =
            this.rowStyle === 'numbered'
                ? `${this._index}. ${title}`
                : this.rowStyle === 'emoji'
                  ? `${this.theme.icons.bullet} ${title}`
                  : title;

        const desc = this.rowStyle === 'aligned' ? Art.truncate(description, 40) : description;

        this.list.addRow(label, desc, id || `${this._index}`);
        this._plain.push(`${title}${description ? ' — ' + description : ''}`);

        return this;
    }

    raw() {
        return this.list;
    }

    toPlainText() {
        return this._plain.join(', ');
    }

    async send(jid, options = {}) {
        return this.list.send(jid, options);
    }

    async safeSend(jid, options = {}) {
        return safeSend(this.list, jid, { ...options, plainText: this.toPlainText() });
    }
}

class StyledPoll {
    constructor(client, { theme = 'NEON', optionStyle = 'circled' } = {}) {
        this.theme = resolveTheme(theme) || THEMES.NEON;
        this.optionStyle = optionStyle;
        this.poll = new Poll(client);
    }

    question(text) {
        this.poll.setQuestion(this.theme.upper ? String(text).toUpperCase() : text);

        return this;
    }

    options(list) {
        const items = Array.isArray(list) ? list : [list];

        items.forEach((item, index) => {
            const label = this._style(item, index);

            this.poll.addOption(label);
        });

        return this;
    }

    _style(label, index) {
        switch (this.optionStyle) {
            case 'letters':
                return `${String.fromCharCode(65 + index)}) ${label}`;
            case 'circled': {
                const circles = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫';

                return `${circles[index] ?? (index + 1)} ${label}`;
            }
            case 'numbers':
                return `${index + 1}. ${label}`;
            case 'emoji':
                return `${this.theme.icons.bullet} ${label}`;
            default:
                return String(label);
        }
    }

    multi(count = 2) {
        this.poll.setSelectableCount(count);

        return this;
    }

    single() {
        return this.multi(1);
    }

    announcement(value = true) {
        this.poll.setToAnnouncementGroup(value);

        return this;
    }

    raw() {
        return this.poll;
    }

    async send(jid, options = {}) {
        return this.poll.send(jid, options);
    }

    async safeSend(jid, options = {}) {
        return safeSend(this.poll, jid, { ...options, plainText: this.poll._question });
    }
}

/* ---------------------------------------------------------------------------
 * PREFLIGHT - inspect + repair ("more perfect than the original")
 * ------------------------------------------------------------------------- */

const SEVERITY = { INFO: 'info', WARN: 'warn', ERROR: 'error' };

class Preflight {
    constructor() {}

    static _issue(code, severity, message, fix) {
        return { code, severity, message, fix };
    }

    /**
     * Media urls inside AI-rich sections are lazy promises (resolved at build
     * time). Materialise every node so inspection sees real values.
     */
    static async _materialize(target) {
        const nodes = target.toArray();
        const out = [];

        for (const node of nodes) {
            out.push({
                index: node.index,
                id: node.id,
                type: node.type,
                section: node.section ? await Toolkit.waitAllPromises(node.section) : null,
                submessage: node.submessage ? await Toolkit.waitAllPromises(node.submessage) : null
            });
        }

        return out;
    }

    /** Audit a builder - returns the issues it would fix. */
    static async inspect(target, { maxTextLength = LIMITS.bodyLength, maxTableRows = 12, maxTableCols = 6, maxSuggestions = LIMITS.suggestions } = {}) {
        const issues = [];

        const label = target?.constructor?.name ?? 'Unknown';

        if (!target) return { target: label, ok: false, issues: [Preflight._issue('NO_TARGET', SEVERITY.ERROR, 'Nothing to inspect')] };

        if (typeof target.validate === 'function') {
            const report = target.validate();

            for (const error of report.errors) issues.push(Preflight._issue('VALIDATION', SEVERITY.ERROR, error.message, 'thrown by validate()'));
            for (const warning of report.warnings) issues.push(Preflight._issue('VALIDATION', SEVERITY.WARN, warning.message, 'advisory'));
        }

        if (typeof target.getButtons === 'function') {
            const buttons = target.getButtons();
            const visible = buttons.filter((button) => button.name !== 'single_select');

            if (visible.length > LIMITS.visibleButtons) {
                issues.push(
                    Preflight._issue(
                        'BUTTON_OVERFLOW',
                        SEVERITY.WARN,
                        `${visible.length} visible buttons (limit ${LIMITS.visibleButtons})`,
                        'fold the overflow into a single_select dropdown'
                    )
                );
            }

            for (const [index, button] of buttons.entries()) {
                if (button.name === 'single_select') {
                    const sections = button.params.sections || [];

                    if (sections.length > LIMITS.sections) {
                        issues.push(Preflight._issue('SECTION_OVERFLOW', SEVERITY.WARN, `selection #${index} has ${sections.length} sections`, 'trim to limit'));
                    }

                    for (const section of sections) {
                        if ((section.rows || []).length > LIMITS.rowsPerSection) {
                            issues.push(
                                Preflight._issue('ROW_OVERFLOW', SEVERITY.WARN, `section "${section.title}" has ${(section.rows || []).length} rows`, 'trim to limit')
                            );
                        }
                    }
                }
            }
        }

        if (typeof target.toArray === 'function') {
            const nodes = await Preflight._materialize(target);

            if (!nodes.length) issues.push(Preflight._issue('EMPTY', SEVERITY.ERROR, 'No content sections', 'add a fallback text section'));

            for (const node of nodes) {
                const primitive = node.section?.view_model?.primitive;

                if (!primitive) continue;

                const text = primitive.text;

                if (typeof text === 'string' && text.length > maxTextLength) {
                    issues.push(Preflight._issue('TEXT_OVERFLOW', SEVERITY.WARN, `section #${node.index} is ${text.length} chars`, `split at ${maxTextLength}`));
                }

                if (typeof text === 'string' && /(\*|_|~|`)/.test(text) && Preflight._unbalanced(text)) {
                    issues.push(Preflight._issue('MARKDOWN', SEVERITY.WARN, `section #${node.index} has unbalanced markdown`, 'close the markers'));
                }

                if (Array.isArray(primitive.rows) && primitive.rows.length - 1 > maxTableRows) {
                    issues.push(Preflight._issue('TABLE_ROWS', SEVERITY.WARN, `table #${node.index} has ${primitive.rows.length - 1} rows`, `trim to ${maxTableRows}`));
                }

                if (primitive.__typename === 'GenAIImaginePrimitive') {
                    const url = primitive.media?.url;

                    if (!url || (typeof url === 'string' && !url.trim())) {
                        issues.push(Preflight._issue('EMPTY_MEDIA', SEVERITY.WARN, `media section #${node.index} has no url`, 'drop the section'));
                    }
                }
            }

            for (const node of nodes) {
                const primitives = node.section?.view_model?.primitives;

                if (Array.isArray(primitives) && primitives[0]?.__typename === 'GenAIFollowUpSuggestionPillPrimitive' && primitives.length > maxSuggestions) {
                    issues.push(Preflight._issue('SUGGEST_OVERFLOW', SEVERITY.WARN, `${primitives.length} suggestions`, `trim to ${maxSuggestions}`));
                }
            }
        }

        const errors = issues.filter((issue) => issue.severity === SEVERITY.ERROR).length;

        return {
            target: label,
            ok: errors === 0,
            issues,
            errors,
            warnings: issues.length - errors
        };
    }

    static _unbalanced(text) {
        const count = (marker) => String(text).split(marker).length - 1;

        return count('*') % 2 === 1 || count('~') % 2 === 1 || count('`') % 2 === 1;
    }

    /** Repair and report what changed (async because media urls are lazy). */
    static async repair(target, options = {}) {
        if (!target) throw new Error('Preflight.repair requires a builder');

        const applied = [];

        if (typeof target.getButtons === 'function' && typeof target.clone === 'function') {
            const result = Preflight.repairButton(target, options);

            return { target: result.target, applied: result.applied, report: await Preflight.inspect(result.target, options) };
        }

        if (typeof target.toArray === 'function') {
            const result = await Preflight.repairRich(target, options);

            return { target: result.target, applied: result.applied, report: await Preflight.inspect(result.target, options) };
        }

        return { target, applied, report: await Preflight.inspect(target, options) };
    }

    /** Button repair: fold overflow into a dropdown, trim selections. */
    static repairButton(button, { visible = LIMITS.visibleButtons, sections = LIMITS.sections, rowsPerSection = LIMITS.rowsPerSection } = {}) {
        const clone = typeof button.clone === 'function' ? button.clone() : button;
        const applied = [];

        const buttons = clone.getButtons();

        const overflow = [];

        let visibleCount = 0;

        for (const [index, item] of buttons.entries()) {
            if (item.name === 'single_select') continue;

            visibleCount++;

            if (visibleCount > visible) overflow.push({ index, ...item });
        }

        if (overflow.length) {
            const foldable = overflow.filter((item) => item.name === 'quick_reply');
            const rest = overflow.filter((item) => item.name !== 'quick_reply');

            for (const item of [...overflow].sort((a, b) => b.index - a.index)) {
                clone.removeButtonAt(item.index);
            }

            if (foldable.length) {
                if (!clone.hasButton('single_select')) {
                    clone.addSelection('More options');
                    clone.makeSection('More');
                } else {
                    /* re-point the selection cursor at the existing dropdown */
                    clone._currentSelectionIndex = clone._buttons.findLastIndex((item) => item.name === 'single_select');

                    const params = clone.getButtons()[clone._currentSelectionIndex]?.params || {};
                    const sectionCount = Array.isArray(params.sections) ? params.sections.length : 0;

                    clone._currentSectionIndex = sectionCount ? sectionCount - 1 : -1;

                    if (clone._currentSectionIndex === -1) clone.makeSection('More');
                }

                for (const item of foldable) {
                    const params = item.params || {};

                    clone.makeRow('', params.display_text || params.id || 'Option', 'Moved from the visible row', params.id || '');
                }

                applied.push(`folded ${foldable.length} reply button(s) into a dropdown`);
            }

            if (rest.length) applied.push(`dropped ${rest.length} non-reply overflow button(s)`);
        }

        /* trim oversized selections */
        for (const [index, item] of clone.getButtons().entries()) {
            if (item.name !== 'single_select') continue;

            const payload = { ...(item.params || {}) };

            if (!Array.isArray(payload.sections)) continue;

            let changed = false;

            if (payload.sections.length > sections) {
                payload.sections = payload.sections.slice(0, sections);
                changed = true;
                applied.push(`trimmed selection #${index} to ${sections} sections`);
            }

            payload.sections = payload.sections.map((section) => {
                if ((section.rows || []).length > rowsPerSection) {
                    changed = true;
                    applied.push(`trimmed "${section.title}" to ${rowsPerSection} rows`);

                    return { ...section, rows: section.rows.slice(0, rowsPerSection) };
                }

                return section;
            });

            if (changed) clone.updateButtonAt(index, payload);
        }

        return { target: clone, applied };
    }

    /** Rich repair: split long text, trim tables, drop empty media, balance markdown. */
    static async repairRich(rich, { maxTextLength = LIMITS.bodyLength, maxTableRows = 12, maxTableCols = 6, maxSuggestions = LIMITS.suggestions } = {}) {
        const nodes = await Preflight._materialize(rich);
        const applied = [];

        const rebuilt = [];

        for (const node of nodes) {
            if (!node.section) continue;

            const primitive = node.section?.view_model?.primitive;

            /* drop empty media sections */
            if (primitive?.__typename === 'GenAIImaginePrimitive') {
                const url = primitive.media?.url;

                if (!url || (typeof url === 'string' && !url.trim())) {
                    applied.push(`dropped empty media section #${node.index}`);
                    continue;
                }
            }

            /* split long text sections at paragraph boundaries */
            if (primitive && typeof primitive.text === 'string' && primitive.text.length > maxTextLength) {
                const parts = Preflight._splitText(primitive.text, maxTextLength);

                for (const part of parts) {
                    rebuilt.push({
                        id: null,
                        section: { ...node.section, view_model: { primitive: { ...primitive, text: part }, __typename: node.section.view_model.__typename } },
                        submessage: node.submessage ? { ...node.submessage, messageText: Art.stripMarkdown(part) } : node.submessage
                    });
                }

                applied.push(`split section #${node.index} (${primitive.text.length} → ${parts.length} parts)`);
                continue;
            }

            /* trim wide / tall tables */
            if (Array.isArray(primitive?.rows)) {
                let rows = primitive.rows;

                if (rows.length - 1 > maxTableRows) {
                    rows = rows.slice(0, maxTableRows + 1);
                    applied.push(`trimmed table #${node.index} to ${maxTableRows} rows`);
                }

                const tooWide = rows.some((row) => (row.cells || []).length > maxTableCols);

                if (tooWide) {
                    rows = rows.map((row) => ({ ...row, cells: (row.cells || []).slice(0, maxTableCols), markdown_cells: row.markdown_cells ? row.markdown_cells.slice(0, maxTableCols) : undefined }));
                    applied.push(`trimmed table #${node.index} to ${maxTableCols} columns`);
                }

                if (rows !== primitive.rows) {
                    rebuilt.push({
                        id: node.id,
                        section: { ...node.section, view_model: { primitive: { ...primitive, rows }, __typename: node.section.view_model.__typename } },
                        submessage: node.submessage
                    });
                    continue;
                }
            }

            /* trim suggestion pills */
            const primitives = node.section?.view_model?.primitives;

            if (Array.isArray(primitives) && primitives[0]?.__typename === 'GenAIFollowUpSuggestionPillPrimitive' && primitives.length > maxSuggestions) {
                rebuilt.push({
                    id: node.id,
                    section: { ...node.section, view_model: { primitives: primitives.slice(0, maxSuggestions), __typename: node.section.view_model.__typename } },
                    submessage: node.submessage
                });

                applied.push(`trimmed suggestions to ${maxSuggestions}`);
                continue;
            }

            /* balance markdown */
            if (primitive && typeof primitive.text === 'string' && Preflight._unbalanced(primitive.text)) {
                rebuilt.push({
                    id: node.id,
                    section: { ...node.section, view_model: { primitive: { ...primitive, text: Art.balanceMarkdown(primitive.text) }, __typename: node.section.view_model.__typename } },
                    submessage: node.submessage
                });

                applied.push(`balanced markdown in section #${node.index}`);
                continue;
            }

            rebuilt.push({ id: node.id, section: node.section, submessage: node.submessage });
        }

        /* rebuild the document */
        const clone = typeof rich.clone === 'function' ? rich.clone() : rich;

        if (applied.length && typeof clone.clear === 'function') {
            clone.clear();

            for (const node of rebuilt) {
                clone._addContent(node.section, node.submessage, node.id ? { id: node.id } : {});
            }
        }

        if (!clone.length) {
            clone.addText('…');
            applied.push('document was empty - added a stub section');
        }

        return { target: clone, applied };
    }

    static _splitText(text, maxLength) {
        const paragraphs = String(text).split(/\n{2,}/);
        const parts = [];
        let current = '';

        const flush = () => {
            if (current) {
                parts.push(current);
                current = '';
            }
        };

        for (const paragraph of paragraphs) {
            if (paragraph.length > maxLength) {
                flush();

                const chunkSize = maxLength - 64;

                for (let i = 0; i < paragraph.length; i += chunkSize) {
                    parts.push(paragraph.slice(i, i + chunkSize));
                }

                continue;
            }

            if ((current + '\n\n' + paragraph).length > maxLength) {
                flush();
                current = paragraph;
            } else {
                current = current ? `${current}\n\n${paragraph}` : paragraph;
            }
        }

        flush();

        return parts.length ? parts : [String(text).slice(0, maxLength)];
    }
}

/* ---------------------------------------------------------------------------
 * SAFE SEND - retry, then downgrade rich -> buttons -> plain text
 * ------------------------------------------------------------------------- */

async function safeSend(target, jid, { attempts = 3, delay = 1200, backoff = 2, chain = ['rich', 'buttons', 'text'], plainText, repair = true, quoted, logger = null, ...options } = {}) {
    const log = (level, message) => logger?.[level]?.(`[nixstyle] ${message}`);

    let builder = target;

    let repairReport = null;

    if (repair && typeof builder.validate === 'function') {
        try {
            const { target: fixed, applied, report } = await Preflight.repair(builder);

            repairReport = report;

            if (applied.length) {
                log('warn', `preflight fixed: ${applied.join('; ')}`);
                builder = fixed;
            }
        } catch (error) {
            log('warn', `preflight skipped: ${error.message}`);
        }
    }

    const socket = builder.socket || builder._socket || target.socket || target._socket;

    const text = plainText || Art.stripMarkdown(builder._body || builder._title || '').slice(0, 3500) || '⚠️ (no content)';

    /* 1 - the real thing */
    if (chain.includes('rich')) {
        try {
            const message = await Toolkit.retry(() => builder.send(jid, { quoted, ...options }), { attempts, delay, backoff });

            return { ok: true, stage: 'rich', message, repair: repairReport };
        } catch (error) {
            log('error', `rich send failed: ${error.message}`);
        }
    }

    /* 2 - downgrade to a button card */
    if (chain.includes('buttons') && socket) {
        try {
            const fallback = new Button(socket)
                .setTitle(builder._title || 'MZAZI')
                .setBody(Art.truncate(text, 900))
                .setFooter(builder._footer || '');

            for (const suggestion of (builder._plain || []).slice(0, 2)) {
                fallback.addReply(Art.truncate(suggestion, 20), Art.truncate(suggestion, 60));
            }

            const message = await Toolkit.retry(() => fallback.send(jid, { quoted }), { attempts, delay, backoff });

            return { ok: true, stage: 'buttons', message, repair: repairReport };
        } catch (error) {
            log('error', `button fallback failed: ${error.message}`);
        }
    }

    /* 3 - plain text, last resort */
    if (chain.includes('text') && socket?.sendMessage) {
        try {
            const message = await Toolkit.retry(() => socket.sendMessage(jid, { text: Art.truncate(text, 3500) }, quoted ? { quoted } : undefined), { attempts, delay, backoff });

            return { ok: true, stage: 'text', message, repair: repairReport };
        } catch (error) {
            log('error', `text fallback failed: ${error.message}`);

            return { ok: false, stage: 'failed', error, repair: repairReport };
        }
    }

    return { ok: false, stage: 'failed', error: new Error('all fallbacks exhausted'), repair: repairReport };
}

/* ---------------------------------------------------------------------------
 * FACTORY + EXPORTS
 * ------------------------------------------------------------------------- */

function styled(client, themeId = 'NEON', options = {}) {
    return new StyledMessage(client, themeId, options);
}

function builder(client, { theme = 'NEON', buttonStyle = 'emoji' } = {}) {
    return new StyledButtons(client, { theme, buttonStyle });
}

function carousel(client, options = {}) {
    return new StyledCarousel(client, options);
}

function list(client, options = {}) {
    return new StyledList(client, options);
}

function poll(client, options = {}) {
    return new StyledPoll(client, options);
}

module.exports = {
    VERSION,
    CODENAME,

    // art + themes
    Art,
    THEMES,
    FRAMES,
    frameText,
    themeIds,
    themeInfo,
    resolveTheme,

    // composer + styled builders
    StyledMessage,
    StyledButtons,
    StyledCarousel,
    StyledList,
    StyledPoll,
    BUTTON_STYLES,
    applyButtonStyle,

    // perfection
    Preflight,
    SEVERITY,
    safeSend,

    // factories
    styled,
    builder,
    carousel,
    list,
    poll,
    style: styled,

    // re-export the raw core so one import is enough
    core: CORE,
    CORE_VERSION: CORE.VERSION,
    AIRich,
    Button,
    ButtonV2,
    Carousel,
    List,
    Poll,
    Event,
    Album,
    Toolkit,
    Text,
    MessageQueue,
    MediaCache: CORE.MediaCache,
    Validator: CORE.Validator,
    Emitter: CORE.Emitter,
    LIMITS
};
