#!/usr/bin/env node
// tools/compress_static.mjs —— 发布产物的文本资源 gzip 预压缩（零依赖，Node 内置 zlib）
//
// 用途：给「已经构建好的发布产物」（tools/build_site.mjs 的输出，默认 .build/site）里的
// 文本资源生成同名 .gz，供 nginx `gzip_static on;` 直接回发，省掉每个请求的实时压缩。
//
// 默认只「报告」：扫描并统计可压缩文件与预计收益，不写任何文件。
// 显式加 --precompress 才真正写出 .gz。这样每个 release 不会被无条件撑大。
//
// 增量复用（发布预压缩的主路径）：
//   构建会在产物根写 .build-state.json（outputs: {<相对路径>: sha256}）。本工具把每个
//   实际写出 .gz 对应的「原文摘要 + 压缩文件摘要 + 压缩设置」也记进同一份 state；发布
//   脚本随后把这份 state 移出产物、落到 DEPLOY_ROOT/build-state/<release>.json（600）。
//   它不进 release、不对外提供，只给下一次发布做私有基线。
//
//   下一次发布用 --previous-dir（上一次 release 目录，旧 .gz 就在里面）与
//   --previous-state（上一次 release 的私有 state）即可直接复用：
//     * 当前原文 sha256 === 记录里的原文 sha256；
//     * 磁盘上旧 .gz 的 sha256 === 记录里的压缩摘要；
//     * 压缩设置指纹（缓存版本 / level / min-size）与记录一致；
//   三条全中就把旧 .gz 硬链接（跨文件系统退回复制）进新产物 —— 不解压、不重新压缩、
//   不重写同一份字节。任何一条不成立（原文变了、.gz 损坏或缺失、设置变了、没有记录）
//   就回落到真实验证：先「解压后与原文逐字节比较」，仍不匹配再按当前 level 重新压缩。
//   因此摘要只用来「跳过重复劳动」，绝不用来放行未经校验的内容。
//
// 用法：
//   node tools/compress_static.mjs --dir .build/site               # 只报告（默认）
//   node tools/compress_static.mjs --dir .build/site --precompress # 写出 .gz
//   node tools/compress_static.mjs --dir .build/site --precompress --level 9
//   node tools/compress_static.mjs --dir .build/site --precompress \
//     --previous-dir /srv/site/current --previous-state /srv/site/build-state/<release>.json
//
// 参数：
//   --dir <目录>     发布产物根目录（默认 .build/site）。拒绝站点源目录 dist/ 与仓库根，
//                    保证 .gz 只落在构建产物里、绝不会混进源码仓库。
//   --precompress    真正写出 .gz（默认只报告）
//   --level <1-9>    gzip 压缩级别，默认 6
//   --min-size <字节> 小于该体积的文件跳过，默认 1024
//   --previous-dir <目录>    上一次发布目录（含旧 .gz）；默认读环境变量 SITE_PREVIOUS_DIR
//   --previous-state <文件>  上一次发布的私有 .build-state.json；默认读 SITE_PREVIOUS_STATE
//
// 性质：只读输入文件 + 可选写 .gz 与产物根的 .build-state.json，不删原文件、不改写文本、
// 不访问网络。遍历按路径排序、压缩级别固定；同一份原文要么按当前 level 重新压缩，要么
// 沿用上一次已被校验过的同一份字节，不会把未校验的内容写进产物。

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DIST_DIR = path.join(REPO_ROOT, "dist");

// 会生成 .gz 的文本扩展名（小写，含点）。
const TEXT_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".xml",
  ".svg",
  ".txt",
  ".md",
  ".map",
]);

const DEFAULT_LEVEL = 6;
const DEFAULT_MIN_SIZE = 1024;

// 复用记录的语义版本：压缩实现或记录字段变化时 +1，旧记录整体作废（只多压一次）。
const GZIP_CACHE_VERSION = 1;
const STATE_FILE = ".build-state.json";
const SHA256_HEX = /^[a-f0-9]{64}$/;

function log(message) {
  process.stdout.write(`[compress] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[compress] 错误：${message}\n`);
  process.exit(1);
}

const VALUE_FLAGS = new Set(["--dir", "--level", "--min-size", "--previous-dir", "--previous-state"]);

function parseArgs(argv) {
  let dir = path.join(REPO_ROOT, ".build", "site");
  let precompress = false;
  let level = DEFAULT_LEVEL;
  let minSize = DEFAULT_MIN_SIZE;
  let previousDir = process.env.SITE_PREVIOUS_DIR || "";
  let previousState = process.env.SITE_PREVIOUS_STATE || "";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(
        "用法：node tools/compress_static.mjs [--dir <发布产物目录>] [--precompress] [--level 1-9] [--min-size <字节>]\n" +
          "                                    [--previous-dir <上次发布目录>] [--previous-state <上次 state 文件>]\n" +
          "  默认只报告收益；--precompress 才写出 .gz（不会进源码仓库，只落在产物目录里）。\n" +
          "  --previous-dir / --previous-state（或 SITE_PREVIOUS_DIR / SITE_PREVIOUS_STATE）指向\n" +
          "  上一次发布，可按摘要直接复用未变化的 .gz，不解压也不重新压缩。\n",
      );
      process.exit(0);
    }
    if (arg === "--precompress") {
      precompress = true;
      continue;
    }
    const separator = arg.indexOf("=");
    const name = separator === -1 ? arg : arg.slice(0, separator);
    if (!VALUE_FLAGS.has(name)) fail(`无法识别的参数：${arg}`);
    let raw;
    if (separator === -1) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) fail(`${name} 后面必须跟一个参数`);
      raw = next;
      i += 1;
    } else {
      raw = arg.slice(separator + 1);
    }
    if (name === "--dir") dir = raw;
    else if (name === "--level") level = Number(raw);
    else if (name === "--min-size") minSize = Number(raw);
    else if (name === "--previous-dir") previousDir = raw;
    else previousState = raw;
  }

  if (!Number.isInteger(level) || level < 1 || level > 9) {
    fail(`--level 必须是 1-9 的整数，收到：${level}`);
  }
  if (!Number.isFinite(minSize) || minSize < 0) {
    fail(`--min-size 必须是非负数字，收到：${minSize}`);
  }
  if (String(dir).trim() === "") {
    fail("--dir 不能为空");
  }

  const dirAbs = path.resolve(String(dir).trim());
  if (!isSafeOutputDir(dirAbs)) {
    fail(
      `拒绝在源码目录上操作：${dirAbs}\n` +
        `  --dir 必须指向构建产物（默认 .build/site），不能是仓库根或站点源目录 dist/。`,
    );
  }
  if (!fs.existsSync(dirAbs) || !fs.statSync(dirAbs).isDirectory()) {
    fail(`产物目录不存在或不是目录：${dirAbs}\n  先跑 node tools/build_site.mjs 生成产物。`);
  }
  return {
    dirAbs,
    precompress,
    level,
    minSize,
    previousDirAbs: absoluteDirectory(previousDir),
    previousStateAbs: absoluteFile(previousState),
  };
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function isSafeOutputDir(dirAbs) {
  if (dirAbs === REPO_ROOT) return false;
  if (dirAbs === DIST_DIR || isInside(dirAbs, DIST_DIR)) return false;
  return true;
}

// 复用来源只是只读参考：不存在就当作没有基线，由调用方按真实字节压缩，不在这里报错。
function absoluteDirectory(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed === "") return null;
  const abs = path.resolve(trimmed);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    log(`提示：上一次发布目录不存在或不是目录，跳过复用：${abs}`);
    return null;
  }
  return abs;
}

function absoluteFile(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed === "") return null;
  const abs = path.resolve(trimmed);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    log(`提示：上一次发布的 state 不存在，本次按真实字节校验/压缩：${abs}`);
    return null;
  }
  return abs;
}

function walk(dirAbs, relPrefix, out) {
  const entries = fs
    .readdirSync(dirAbs, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (entry.name.startsWith('.build-')) continue;
    const rel = relPrefix === "" ? entry.name : `${relPrefix}/${entry.name}`;
    const abs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      walk(abs, rel, out);
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push({ rel, abs });
    }
    // 上一轮写出的 .gz / .br 扩展名不在 TEXT_EXTENSIONS 里，会在上面这轮被自然跳过：
    // 重复运行不会把 .gz 当成输入；写出走临时文件 + rename，结果确定。
  }
  return out;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function isDigest(value) {
  return typeof value === "string" && SHA256_HEX.test(value);
}

function readJsonObject(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

// 压缩设置指纹：任一项变了就不再复用旧 .gz 的字节（只会让下一次多压一遍，不会用错）。
function settingsDigest(level, minSize) {
  return sha256(JSON.stringify([GZIP_CACHE_VERSION, level, minSize]));
}

// 只有版本、设置指纹与字段都对得上的记录才可用。
//   records  —— 可用的逐文件摘要；
//   blocked  —— 有记录但版本/设置变了：这不是「没有基线」，而是「按当前设置重新压缩」，
//               此时绝不能再退回解压校验把旧 level 的字节复用回来。
// 没有 state 或 state 里根本没有 gzip 段（旧版本留下的基线）才允许走解压校验兜底。
function gzipCache(state, settings) {
  const section = state?.gzip;
  if (!section) return { records: null, blocked: false };
  if (section.version !== GZIP_CACHE_VERSION || section.settings !== settings) {
    return { records: null, blocked: true };
  }
  if (!section.files || typeof section.files !== "object" || Array.isArray(section.files)) {
    return { records: null, blocked: false };
  }
  return { records: section.files, blocked: false };
}

function gzipRecord(records, relative) {
  const record = records?.[relative];
  if (!record || !isDigest(record.raw) || !isDigest(record.gz)) return null;
  return record;
}

function readFileDigest(file) {
  try {
    const buffer = fs.readFileSync(file);
    return { size: buffer.length, digest: sha256(buffer) };
  } catch {
    return null;
  }
}

// 现行真实验证：解压后与原文逐字节比较。只在没有可信摘要（或摘要对不上）时兜底。
function verifyByInflate(file, raw) {
  try {
    const gz = fs.readFileSync(file);
    if (!zlib.gunzipSync(gz).equals(raw)) return null;
    return { size: gz.length, digest: sha256(gz) };
  } catch {
    return null;
  }
}

// 先写同目录临时文件再 rename：既保证原子替换，也不会原地截断硬链接进来的旧 release .gz。
function replaceAtomic(target, produce) {
  const temp = `${target}.tmp-${process.pid}`;
  try {
    fs.rmSync(temp, { force: true });
    produce(temp);
    fs.renameSync(temp, target);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function linkOrCopy(source, target) {
  return replaceAtomic(target, (temp) => {
    try {
      fs.linkSync(source, temp);
    } catch {
      // 跨文件系统 / 链接数上限：退回复制同一份已验证字节。
      fs.copyFileSync(source, temp);
    }
  });
}

function writeGzip(target, gz) {
  return replaceAtomic(target, (temp) => fs.writeFileSync(temp, gz));
}

function saveGzipRecords(statePath, state, settings, level, minSize, files) {
  if (!state) {
    log(`提示：产物根没有可解析的 ${STATE_FILE}，本次只写 .gz、不记录复用摘要（下次发布仍会按真实字节校验）`);
    return;
  }
  const next = {
    ...state,
    gzip: { version: GZIP_CACHE_VERSION, settings, level, minSize, files },
  };
  try {
    const mode = fs.statSync(statePath).mode & 0o777;
    replaceAtomic(statePath, (temp) => fs.writeFileSync(temp, JSON.stringify(next), { mode }));
  } catch (error) {
    // 记录写不进去只损失下一次的复用，不影响本次 .gz 的正确性。
    log(`提示：写入复用摘要失败（${error.message}），本次 .gz 仍有效`);
  }
}

function main() {
  const { dirAbs, precompress, level, minSize, previousDirAbs, previousStateAbs } = parseArgs(
    process.argv.slice(2),
  );
  const settings = settingsDigest(level, minSize);
  const settingsLabel = `level ${level}，min-size ${minSize}，缓存版本 ${GZIP_CACHE_VERSION}`;

  log(`产物目录：${dirAbs}`);
  log(`模式：${precompress ? `写出 .gz（${settingsLabel}）` : `只报告（${settingsLabel}；加 --precompress 才写出）`}`);
  log(`上一次 release：${previousDirAbs ?? "（未提供，全部按当前内容处理）"}`);

  const statePath = path.join(dirAbs, STATE_FILE);
  const currentState = readJsonObject(statePath);
  const previousStateObject = previousStateAbs ? readJsonObject(previousStateAbs) : null;
  // 复用来源按优先级排列：上一次 release（发布主路径），以及本目录上一次运行留下的 .gz。
  const sources = [];
  if (previousDirAbs) {
    const cache = gzipCache(previousStateObject, settings);
    sources.push({ label: "上一次 release", dir: previousDirAbs, ...cache });
    if (cache.blocked) {
      log(`提示：上一次 release 的压缩记录版本或设置与本次不同，旧 .gz 不再复用（按当前 ${settingsLabel} 重新压缩）`);
    } else if (!cache.records) {
      log("提示：上一次 release 没有可用的复用记录（旧版 state 或没有 state），改按真实字节校验");
    }
  }
  if (!previousDirAbs || previousDirAbs !== dirAbs) {
    sources.push({ label: "本目录上一次的 .gz", dir: dirAbs, ...gzipCache(currentState, settings) });
  }
  const recordSources = sources.filter((source) => source.records);
  log(
    `复用记录：${recordSources.length ? recordSources.map((source) => source.label).join(" / ") : "无"}`,
  );

  const files = walk(dirAbs, "", []);
  let considered = 0;
  let skippedSmall = 0;
  let gzipped = 0;
  let written = 0;
  let reused = 0;
  let reusedByDigest = 0;
  let reusedByInflate = 0;
  let recompressed = 0;
  let skippedLarger = 0;
  let rawTotal = 0;
  let gzTotal = 0;
  const rows = [];
  const records = {};

  for (const file of files) {
    const raw = fs.readFileSync(file.abs);
    if (raw.length < minSize) {
      skippedSmall += 1;
      continue;
    }
    considered += 1;
    const rawDigest = sha256(raw);
    const target = `${file.abs}.gz`;

    let source = null;
    for (const candidate of sources) {
      // 版本/设置变了的记录代表「必须按当前设置重压」，连解压校验都不做，避免把旧 level 的字节复用回来。
      if (candidate.blocked) continue;
      const cached = path.join(candidate.dir, `${file.rel}.gz`);
      const record = gzipRecord(candidate.records, file.rel);
      // 原文摘要对不上时，这份旧 .gz 一定不是当前原文的产物：直接跳过，别浪费一次解压。
      if (record && record.raw !== rawDigest) continue;
      if (record) {
        const found = readFileDigest(cached);
        if (found && found.digest === record.gz) {
          source = { ...found, file: cached, verified: "digest" };
          break;
        }
      }
      // 没有记录或记录对不上磁盘字节：回现行真实验证（解压后逐字节比较）。
      const verified = verifyByInflate(cached, raw);
      if (verified) {
        source = { ...verified, file: cached, verified: "inflate" };
        break;
      }
    }

    rawTotal += raw.length;

    let gzSize;
    let gzDigest;
    let gz = null;
    if (source) {
      gzSize = source.size;
      gzDigest = source.digest;
    } else {
      gz = zlib.gzipSync(raw, { level });
      gzSize = gz.length;
      gzDigest = sha256(gz);
    }

    if (gzSize >= raw.length) {
      // 压不小就放弃：避免为几个字节的收益多留一份文件。
      skippedLarger += 1;
      gzTotal += raw.length;
      continue;
    }
    gzTotal += gzSize;
    gzipped += 1;
    if (source) {
      reused += 1;
      if (source.verified === "digest") reusedByDigest += 1;
      else reusedByInflate += 1;
    } else {
      recompressed += 1;
    }
    const ratio = ((1 - gzSize / raw.length) * 100).toFixed(1);
    rows.push({ rel: file.rel, raw: raw.length, gz: gzSize, ratio });

    if (precompress) {
      const inPlace = source && path.resolve(source.file) === path.resolve(target);
      if (!inPlace) {
        if (source) linkOrCopy(source.file, target);
        else writeGzip(target, gz);
        written += 1;
      }
      records[file.rel] = { raw: rawDigest, gz: gzDigest, size: raw.length, gzSize };
    }
  }

  rows.sort((a, b) => b.raw - a.raw);
  log(
    `复用已验证的压缩产物：${reused}（摘要匹配 ${reusedByDigest}、解压校验 ${reusedByInflate}），` +
      `重新压缩 ${recompressed} 个`,
  );
  for (const row of rows.slice(0, 20)) {
    log(
      `  ${row.rel}  ${formatBytes(row.raw)} → ${formatBytes(row.gz)}（省 ${row.ratio}%）`,
    );
  }
  if (rows.length > 20) log(`  …… 其余 ${rows.length - 20} 个文件略`);

  const saving = rawTotal > 0 ? ((1 - gzTotal / rawTotal) * 100).toFixed(1) : "0.0";
  log(`候选文本文件：${considered}（跳过过小 ${skippedSmall}，压不小 ${skippedLarger}）`);
  log(`可压缩：${gzipped} 个，文本总体积 ${formatBytes(rawTotal)} → ${formatBytes(gzTotal)}（省 ${saving}%）`);
  if (precompress) {
    saveGzipRecords(statePath, currentState, settings, level, minSize, records);
    log(`已写出 .gz：${written} 个（其余 ${gzipped - written} 个沿用本目录里已存在的压缩产物）`);
    log("产物目录如需重跑构建，先删掉这些 .gz 再跑，或让发布脚本忽略 *.gz。");
  } else {
    log("未写出任何文件。启用 nginx gzip_static 时，部署前跑一次 --precompress 即可。");
  }
  log("提醒：.gz 只落在发布产物里，不要提交进源码仓库（本脚本已拒绝在 dist/ 与仓库根上运行）。");
}

main();
