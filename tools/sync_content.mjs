#!/usr/bin/env node
// tools/sync_content.mjs —— 从「内容仓库」把图片资产与投稿模板同步进本代码仓库的 dist/ 工作区
//
// 背景：本站源码（本仓库）与图片 / 投稿内容（lmy414/ai-girl-stickers）已经分家。
// 本仓库的 dist/ 只跟踪手写的站点页面 / 样式 / 脚本；**清单类 JSON 由本仓库的
// data/ 经 tools/stage_data.mjs 暂存进 dist/**，内容仓库只提供图片与投稿模板。
//
// 用法：
//   node tools/sync_content.mjs --content-dir <内容仓库根目录>
//   node tools/sync_content.mjs --content-dir=<路径>
//   CONTENT_DIR=<路径> node tools/sync_content.mjs
//
// 行为契约：
//   1. --content-dir / CONTENT_DIR 指向**内容仓库根目录**（不是它的 dist/）。
//      图片读 <内容仓库>/dist/<目标>，投稿模板读 <内容仓库根>/.github/ISSUE_TEMPLATE/，
//      都写进 <本仓库>/dist/<同名目标>。
//   2. 只同步下面 SYNC_FILE_TARGETS / ROOT_SYNC_FILE_TARGETS / SYNC_DIR_TARGETS
//      列出的目标；其余文件（手写页面、styles.css、tokens.css、analytics.js 等）
//      一律不碰。**绝不从内容仓库同步任何 JSON 清单**（见下）。
//   3. 不复制 submissions/originals/，也不复制 owner-picks/ 根目录下的原图——
//      原图只留在内容仓库，线上走 GitHub Raw。
//   4. 增量覆盖语义：不再先整目录删除再全量复制。逐文件比较源与目标的**字节**
//      （先比尺寸），只复制内容确实不同的文件，删掉内容仓库里已经没有的同名条目。
//      清理范围写死在清单里，不做通配删除，每一步都断言目标仍在 <本仓库>/dist 之内。
//   5. 源校验：内容仓库必需的图片 / 模板先校验存在且非空；同步时逐文件确认源仍是
//      普通文件；内容仓库里的符号链接（含目录目标本身）只有解析后仍留在内容仓库内
//      时才跟随，指向仓库外直接报错。
//   6. 不原地改写 inode：每个文件先写同目录临时文件再 rename 覆盖。dist/ 里的文件
//      可能与已发布的 release 共享同一个 inode（发布端 cp -al），原地改写会把旧
//      release 一起改掉；rename 只替换目录项。
//   7. 不跟随目标侧符号链接：目标父目录若是符号链接就报错；目标树里的符号链接一律
//      删掉重写，绝不顺着它写到白名单以外。
//   8. 以源字节为准：tools/prepare_preview_assets.py 压过的预览与源不同，下一轮会被
//      恢复成原图，再由它按内容指纹装回已验证的压缩产物（不重复编码）。目标被外部
//      改坏时同理自动修复；压缩规则 / 编码器运行时变化也会在下一轮真正生效。
//   9. 不维护任何增量状态文件：判断依据就是磁盘上的真实字节。代价是每轮读一遍源与
//      目标文件，但不会出现状态与实际不一致、或缓存过期还继续跳过的情况。
//  10. 确定性：目录条目按名字排序后处理，同一输入两次同步结果一致。
//  11. Windows / POSIX 路径都可以（统一走 node:path 解析）。
//
// 清单类 JSON（characters / categories / works / blue-fish-ids / blue-fish 叠加层）
// **不从内容仓库同步**：它们的权威副本在本仓库 data/，由 tools/stage_data.mjs
// 暂存进 dist/。投稿模板仍归内容仓库管、留在它的 .github/，这里同步一份副本进
// dist/.github/ 供本地比对（产物侧由 tools/build.mjs 排除）；模板内容由
// tools/sync_issue_template.mjs 从本仓库 data/characters.json 生成 / 校验。
//
// 本仓库内不需要 Node 之外的依赖，也不联网。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DIST_DIR = path.join(REPO_ROOT, "dist");

// 从内容仓库 dist/ 同步到本仓库 dist/ 的单个图片文件（相对路径，POSIX 风格）。
// 站点页面上出现的图都归内容仓库管，本仓库不跟踪任何图片位图。
const SYNC_FILE_TARGETS = [
  "favicon.ico",
  "favicon.png",
  "avatar.png",
  "credits/shuangshuang.jpg",
  // 2026 国庆活动开屏弹窗与活动页用的表情包。
  "events/national-day-2026.webp",
];

// 从内容仓库**根目录**（不是它的 dist/）同步到本仓库 dist/ 的单个文件。
// 投稿模板归内容仓库管、放在它仓库根的 .github/，这里同步一份副本；
// 产物侧由 tools/build.mjs 的 SKIP_DIRS 排除 .github，不会进发布包。
const ROOT_SYNC_FILE_TARGETS = [".github/ISSUE_TEMPLATE/sticker-submission.yml"];

// 从内容仓库 dist/ 同步到本仓库 dist/ 的目录（均为派生图 / 预览图）。
// 注意：不含 submissions/originals（原图不进构建）与 owner-picks 根原图；
// data/ 只取 blue-fish 预览图，classification / editorial 清单已在 data/。
const SYNC_DIR_TARGETS = [
  "submissions/previews",
  "submissions/large",
  "owner-picks/previews",
  "data/blue-fish/previews",
  // 作者型专题页的作者头像：按 topicId 命名（<topicId>.webp），内容仓库会提交该目录。
  "author-avatars",
  // 角色页头部专用透明参考图；原作品与图库预览沿用原有图片。
  "character-portraits",
  // 社群页与关于页共用的 QQ 群 / 微信公众号二维码；文件名带内容 hash。
  "community",
];

const SYNC_TARGETS = [
  ...SYNC_FILE_TARGETS,
  ...ROOT_SYNC_FILE_TARGETS,
  ...SYNC_DIR_TARGETS,
];

// 内容仓库 dist/ 里必须存在的具体图片文件。
const REQUIRED_CONTENT_DIST_FILES = [...SYNC_FILE_TARGETS];
// 内容仓库根里必须存在、并会被同步进本仓库 dist/.github/ 的文件。
const REQUIRED_CONTENT_ROOT_FILES = [...ROOT_SYNC_FILE_TARGETS];

function log(message) {
  process.stdout.write(`[sync-content] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[sync-content] 错误：${message}\n`);
  process.exit(1);
}

function toPosix(relPath) {
  return relPath.split(path.sep).join("/");
}

function parseArgs(argv) {
  let contentDir = process.env.CONTENT_DIR || null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--content-dir") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        fail("--content-dir 后面必须跟一个目录路径");
      }
      contentDir = value;
      i += 1;
    } else if (arg.startsWith("--content-dir=")) {
      contentDir = arg.slice("--content-dir=".length);
    } else if (arg === "-h" || arg === "--help") {
      process.stdout.write(
        "用法：node tools/sync_content.mjs --content-dir <内容仓库根目录>\n" +
          "  也可用环境变量 CONTENT_DIR 指定内容仓库根目录。\n",
      );
      process.exit(0);
    } else {
      fail(`无法识别的参数：${arg}（内容仓库根目录用 --content-dir 指定）`);
    }
  }
  if (contentDir === null || String(contentDir).trim() === "") {
    fail("必须指定内容仓库根目录：--content-dir <路径> 或 CONTENT_DIR=<路径>");
  }
  return { contentDir: path.resolve(String(contentDir).trim()) };
}

// 目标必须落在 <本仓库>/dist 之内，且不能就是 dist 本身。
function resolveInsideDist(relTarget) {
  const abs = path.resolve(DIST_DIR, relTarget.split("/").join(path.sep));
  const rel = path.relative(DIST_DIR, abs);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    fail(`同步目标逃出本仓库 dist/，拒绝操作：${relTarget}`);
  }
  return abs;
}

// ---------------------------------------------------------------- 源侧

// 目录必须存在且是目录，解析后还必须留在内容仓库内（允许仓库内部的符号链接）。
function requireSourceDirectory(absPath, label, boundary) {
  let stat;
  try {
    stat = fs.statSync(absPath);
  } catch {
    fail(`${label} 不存在：${absPath}`);
  }
  if (!stat.isDirectory()) {
    fail(`${label} 不是目录：${absPath}`);
  }
  const real = fs.realpathSync(absPath);
  if (!isInside(boundary, real)) {
    fail(`${label} 指向内容仓库之外，拒绝同步：${absPath} -> ${real}`);
  }
}

// 必需的源文件必须是非空普通文件，缺一个就整体失败（与旧行为一致）。
function requireSourceFile(absPath, label, boundary) {
  let stat;
  try {
    stat = fs.statSync(absPath);
  } catch {
    fail(`${label} 不存在：${absPath}`);
  }
  if (!stat.isFile() || stat.size <= 0) {
    fail(`${label} 不是非空文件：${absPath}`);
  }
  const real = fs.realpathSync(absPath);
  if (!isInside(boundary, real)) {
    fail(`${label} 指向内容仓库之外，拒绝同步：${absPath} -> ${real}`);
  }
}

function realDirectory(absPath, label) {
  let stat;
  try {
    stat = fs.statSync(absPath);
  } catch {
    fail(`${label} 不存在：${absPath}`);
  }
  if (!stat.isDirectory()) {
    fail(`${label} 不是目录：${absPath}`);
  }
  return fs.realpathSync(absPath);
}

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// 源条目必须是普通文件或目录。符号链接只在解析后仍留在内容仓库（boundary）内时跟随，
// 并且对目录链接做成环检查；其它类型（fifo / socket / 设备）一律报错。
function classifySource(absPath, dirent, boundary, visitedDirs) {
  if (dirent.isDirectory()) return "dir";
  if (dirent.isFile()) return "file";
  if (dirent.isSymbolicLink()) {
    const real = fs.realpathSync(absPath);
    if (!isInside(boundary, real)) {
      fail(`内容仓库里的符号链接指向仓库外，拒绝同步：${absPath} -> ${real}`);
    }
    const stat = fs.statSync(absPath);
    if (stat.isFile()) return "file";
    if (stat.isDirectory()) {
      if (visitedDirs.has(real)) fail(`内容仓库里出现成环的目录符号链接：${absPath} -> ${real}`);
      visitedDirs.add(real);
      return "dir";
    }
  }
  return fail(`内容仓库里出现不支持的条目类型（不是普通文件 / 目录 / 符号链接）：${absPath}`);
}

// ---------------------------------------------------------------- 目标侧
//
// 所有写入都限制在 <本仓库>/dist 之内：路径先做词法断言，父目录必须是真目录，
// 目标树里的符号链接一律删掉重写，绝不跟随。

function lstatOrNull(absPath) {
  try {
    return fs.lstatSync(absPath);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

// 删除目标侧条目（文件 / 符号链接 / 目录）。只用 lstat + unlink / rmdir，
// 不会跟随符号链接，因此碰不到白名单以外的东西。返回删除的文件数。
function removeEntry(absPath) {
  const stat = fs.lstatSync(absPath);
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    let removed = 0;
    for (const name of fs.readdirSync(absPath)) removed += removeEntry(path.join(absPath, name));
    fs.rmdirSync(absPath);
    return removed;
  }
  // 文件 / 符号链接 / junction：只删目录项，不碰它指向的东西。
  fs.rmSync(absPath, { force: true });
  return 1;
}

// dist/ 下、目标上方的父目录必须是真目录；遇到符号链接就停下，避免顺着写到别处。
function ensureDistParent(absDir) {
  const rel = path.relative(DIST_DIR, absDir);
  if (rel === "" || rel === ".") return;
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    fail(`拒绝写入 dist/ 之外的目录：${absDir}`);
  }
  let current = DIST_DIR;
  for (const part of rel.split(path.sep)) {
    current = path.join(current, part);
    const stat = lstatOrNull(current);
    if (stat === null) {
      fs.mkdirSync(current);
      continue;
    }
    if (stat.isSymbolicLink()) {
      fail(`dist/ 里的父目录是指向别处的符号链接，拒绝跟随：${current}`);
    }
    if (!stat.isDirectory()) {
      fail(`dist/ 里的父路径不是目录：${current}`);
    }
  }
}

// 目标树内部的目录：已存在但不是真目录（文件 / 符号链接）就先删掉再建。
function ensureTreeDirectory(absDir) {
  const stat = lstatOrNull(absDir);
  if (stat !== null && stat.isDirectory() && !stat.isSymbolicLink()) return 0;
  const removed = stat === null ? 0 : removeEntry(absDir);
  fs.mkdirSync(absDir);
  return removed;
}

// 先写同目录临时文件再 rename：dist/ 里的文件可能与已发布的 release 共享同一个
// inode（发布端用 cp -al 硬链接），原地改写会把旧 release 一起改掉。
function writeFileReplacing(destAbs, data, mode) {
  const temporary = path.join(path.dirname(destAbs), `.${path.basename(destAbs)}.sync-tmp`);
  try {
    if (lstatOrNull(temporary) !== null) removeEntry(temporary);
    fs.writeFileSync(temporary, data, { mode: mode & 0o777 });
    try {
      fs.chmodSync(temporary, mode & 0o777);
    } catch {
      // Windows 只支持只读位，权限尽量对齐即可。
    }
    try {
      fs.renameSync(temporary, destAbs);
    } catch (error) {
      // Windows 上覆盖只读文件会 EPERM：先去掉只读位再重试。
      if (error && (error.code === "EPERM" || error.code === "EACCES")) {
        try {
          fs.chmodSync(destAbs, 0o666);
        } catch {
          // 目标不存在或本来就改不动：交给下一次 rename 报错。
        }
        fs.renameSync(temporary, destAbs);
        return;
      }
      throw error;
    }
  } finally {
    try {
      if (lstatOrNull(temporary) !== null) removeEntry(temporary);
    } catch {
      // 临时文件清理失败不影响同步结果。
    }
  }
}

// ---------------------------------------------------------------- 同步

function syncFile(srcAbs, destAbs, ctx) {
  const srcStat = fs.statSync(srcAbs);
  if (!srcStat.isFile()) fail(`源条目不是普通文件：${srcAbs}`);
  ctx.stats.total += 1;

  const data = fs.readFileSync(srcAbs);
  const destStat = lstatOrNull(destAbs);
  if (destStat !== null && destStat.isFile() && destStat.size === data.length) {
    if (fs.readFileSync(destAbs).equals(data)) {
      ctx.stats.skipped += 1;
      return;
    }
  }

  ensureDistParent(path.dirname(destAbs));
  const removed = destStat !== null && !destStat.isFile() ? removeEntry(destAbs) : 0;
  writeFileReplacing(destAbs, data, srcStat.mode);
  ctx.stats.copied += 1;
  ctx.stats.removed += removed;
}

function syncDirectory(srcDirAbs, destDirAbs, ctx) {
  const removed = ensureTreeDirectory(destDirAbs);
  ctx.stats.removed += removed;
  const entries = fs
    .readdirSync(srcDirAbs, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const names = new Set(entries.map((entry) => entry.name));

  for (const entry of entries) {
    const srcPath = path.join(srcDirAbs, entry.name);
    const destPath = path.join(destDirAbs, entry.name);
    if (classifySource(srcPath, entry, ctx.boundary, ctx.visitedDirs) === "dir") {
      syncDirectory(srcPath, destPath, ctx);
      continue;
    }
    syncFile(srcPath, destPath, ctx);
  }

  // 内容仓库里已经没有的条目：从 dist/ 删掉。
  for (const name of fs.readdirSync(destDirAbs)) {
    if (names.has(name)) continue;
    ctx.stats.removed += removeEntry(path.join(destDirAbs, name));
  }
}

function main() {
  const { contentDir } = parseArgs(process.argv.slice(2));

  const contentReal = realDirectory(contentDir, "内容仓库根目录");
  if (path.resolve(contentDir) === REPO_ROOT) {
    fail("内容仓库目录不能是本代码仓库根目录");
  }
  const contentDist = realDirectory(
    path.join(contentReal, "dist"),
    "内容仓库 dist/（--content-dir 应指向内容仓库根目录）",
  );

  // dist/ 必须是真目录：如果它是指向别处的符号链接，增量写入就会跑到 dist 之外。
  const distStat = lstatOrNull(DIST_DIR);
  if (distStat === null) fail(`本仓库里找不到 dist/：${DIST_DIR}`);
  if (distStat.isSymbolicLink()) fail(`本仓库 dist/ 是指向别处的符号链接，拒绝写入：${DIST_DIR}`);
  if (!distStat.isDirectory()) fail(`本仓库 dist/ 不是目录：${DIST_DIR}`);

  // 1. 校验内容仓库必需图片 / 模板存在（缺一个或指向仓库外就整体失败，不先动 dist/）。
  for (const rel of REQUIRED_CONTENT_ROOT_FILES) {
    requireSourceFile(path.resolve(contentReal, ...rel.split("/")), `内容仓库 ${rel}`, contentReal);
  }
  for (const rel of REQUIRED_CONTENT_DIST_FILES) {
    requireSourceFile(path.resolve(contentDist, ...rel.split("/")), `内容仓库 dist/${rel}`, contentReal);
  }
  for (const rel of SYNC_DIR_TARGETS) {
    requireSourceDirectory(path.resolve(contentDist, ...rel.split("/")), `内容仓库 dist/${rel}`, contentReal);
  }

  log(`内容仓库：${contentReal}`);
  log(`本仓库 dist：${DIST_DIR}`);
  log(`同步目标：${SYNC_TARGETS.join(", ")}`);

  const ctx = {
    boundary: contentReal,
    visitedDirs: new Set(),
    stats: { copied: 0, skipped: 0, removed: 0, total: 0 },
  };

  // 2. 单文件目标：图片来自内容仓库 dist/，投稿模板来自内容仓库根。
  for (const rel of SYNC_FILE_TARGETS) {
    const destPath = resolveInsideDist(rel);
    ensureDistParent(path.dirname(destPath));
    syncFile(path.resolve(contentDist, ...rel.split("/")), destPath, ctx);
  }
  for (const rel of ROOT_SYNC_FILE_TARGETS) {
    const destPath = resolveInsideDist(rel);
    ensureDistParent(path.dirname(destPath));
    syncFile(path.resolve(contentReal, ...rel.split("/")), destPath, ctx);
  }

  // 3. 目录目标：逐文件对齐（新增 / 变化 / 删除），字节相同的不重写。
  for (const rel of SYNC_DIR_TARGETS) {
    const srcPath = path.resolve(contentDist, ...rel.split("/"));
    const destPath = resolveInsideDist(rel);
    ensureDistParent(path.dirname(destPath));
    ctx.visitedDirs = new Set();
    syncDirectory(srcPath, destPath, ctx);
  }

  const { copied, skipped, removed, total } = ctx.stats;
  log(`同步完成：复制 ${copied} 个，跳过字节相同 ${skipped} 个，删除 ${removed} 个（源侧共 ${total} 个文件）`);
  log(`已跳过（不入本仓库 dist）：submissions/originals、owner-picks 根原图、内容仓库的任何 JSON 清单`);
  log(`同步目录清单：${SYNC_DIR_TARGETS.map((rel) => toPosix(rel)).join(", ")}`);
}

main();
