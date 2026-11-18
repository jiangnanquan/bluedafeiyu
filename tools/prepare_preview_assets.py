"""Fit oversized WebP thumbnails to the gallery's transfer budget.

同一份输入 + 同一套 ENCODE_SETTINGS + 同一个编码器运行时（Pillow / libwebp）编出来的
WebP 字节是确定的，所以这里把产物按「输入内容 + 处理规则 + 编码运行时」的摘要缓存进
`.build/preview-cache/`：

- 每轮 sync 都会把被压过的大图恢复成原图（字节不同就重发），这里按原图内容指纹
  装回已验证的压缩字节，不再重新编码；
- 缓存缺失 / 损坏 / 规则或运行时变了就按原样重新编码一遍（新规则下一轮即生效）；
- 缓存只落在 `.build/`（git 忽略），不写进 dist/，也不碰内容仓库。

写回缩略图一律走「同目录临时文件 + rename」：dist/ 里的文件可能与已发布 release 共享
同一个 inode（发布端 cp -al 硬链接），原地改写会把旧 release 一起改掉。
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import PIL
from PIL import features

from generate_image_derivatives import write_derivative

MAX_BYTES = 100_000
ENCODE_SETTINGS = ((384, 80, 24), (320, 74, 16), (240, 70, 12), (192, 65, 8), (128, 60, 6), (96, 55, 2))
ENCODE_METHOD = 2

# 缓存键 = CACHE_VERSION + 处理规则 + 编码器运行时 + 输入内容摘要；
# 任何一项变了都按新键重编，绝不会拿旧规则 / 旧运行时的字节当结果。
CACHE_VERSION = 1
CACHE_ROOT = Path(__file__).resolve().parents[1] / ".build" / "preview-cache"
CACHE_STATE = CACHE_ROOT / "state.json"

_STATE: dict | None = None
_CACHE_WARNING_SHOWN = False


def _warn_cache(error: OSError) -> None:
    """缓存只是优化：写不进去也照样把缩略图压好。"""
    global _CACHE_WARNING_SHOWN
    if not _CACHE_WARNING_SHOWN:
        _CACHE_WARNING_SHOWN = True
        print(f"[preview-assets] 缓存写入失败，本轮不写缓存（下次会重新编码）：{error}", file=sys.stderr)


def _settings_digest() -> str:
    payload = {
        "version": CACHE_VERSION,
        "max_bytes": MAX_BYTES,
        "encode_settings": [list(setting) for setting in ENCODE_SETTINGS],
        "method": ENCODE_METHOD,
        "pillow": PIL.__version__,
        "webp": features.version("webp"),
    }
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _empty_state(settings: str) -> dict:
    return {"version": CACHE_VERSION, "settings": settings, "files": {}}


def _discard_cache() -> None:
    """半套 / 损坏的缓存一律作废：下次照原样重编一遍即可。"""
    shutil.rmtree(CACHE_ROOT, ignore_errors=True)


def _load_state() -> dict:
    settings = _settings_digest()
    try:
        state = json.loads(CACHE_STATE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        if CACHE_ROOT.exists():
            _discard_cache()  # 只剩产物、没有校验信息的缓存不可信
        return _empty_state(settings)
    except (OSError, ValueError):
        _discard_cache()
        return _empty_state(settings)
    if not isinstance(state, dict) or state.get("version") != CACHE_VERSION:
        _discard_cache()
        return _empty_state(settings)
    files = state.get("files")
    if not isinstance(files, dict):
        _discard_cache()
        return _empty_state(settings)
    # 缓存键已经包含规则 / 运行时摘要：设置变过时旧键自然查不到，但记录留着，
    # 切回旧设置时还能直接命中，不必重编一遍。
    return {"version": CACHE_VERSION, "settings": settings, "files": files}


def _state() -> dict:
    global _STATE
    if _STATE is None:
        _STATE = _load_state()
    return _STATE


def _save_state() -> None:
    state = _state()
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    temporary = CACHE_STATE.with_name(f".{CACHE_STATE.name}.tmp")
    try:
        temporary.write_text(payload, encoding="utf-8")
        os.replace(temporary, CACHE_STATE)
    finally:
        temporary.unlink(missing_ok=True)


def _cache_key(input_digest: str) -> str:
    seed = f"{_state()['settings']}:{input_digest}".encode("ascii")
    return hashlib.sha256(seed).hexdigest()


def _cached_bytes(key: str, input_digest: str) -> bytes | None:
    """取回并校验缓存产物；记录缺失、文件丢失或摘要对不上都当作没有缓存。"""
    record = _state()["files"].get(key)
    if not isinstance(record, dict) or record.get("input") != input_digest:
        return None
    artifact = CACHE_ROOT / f"{key}.webp"
    try:
        data = artifact.read_bytes()
    except OSError:
        _state()["files"].pop(key, None)
        return None
    if (
        len(data) != record.get("size")
        or len(data) >= MAX_BYTES
        or hashlib.sha256(data).hexdigest() != record.get("output")
    ):
        _state()["files"].pop(key, None)
        artifact.unlink(missing_ok=True)
        return None
    return data


def _store_artifact(key: str, input_digest: str, data: bytes) -> None:
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    artifact = CACHE_ROOT / f"{key}.webp"
    temporary = artifact.with_name(f".{artifact.name}.tmp")
    try:
        temporary.write_bytes(data)
        os.replace(temporary, artifact)
    finally:
        temporary.unlink(missing_ok=True)
    _state()["files"][key] = {
        "input": input_digest,
        "output": hashlib.sha256(data).hexdigest(),
        "size": len(data),
    }


def _replace(preview: Path, data: bytes) -> None:
    """临时文件 + rename 换上新的缩略图，绝不原地改写已有 inode。"""
    temporary = preview.with_name(f".{preview.name}.preview-tmp")
    try:
        temporary.write_bytes(data)
        os.replace(temporary, preview)
    finally:
        temporary.unlink(missing_ok=True)


def fit_previews(directory: Path) -> int:
    updated = 0
    for preview in sorted(directory.rglob("*.webp")):
        if preview.stat().st_size < MAX_BYTES:
            continue
        input_digest = hashlib.sha256(preview.read_bytes()).hexdigest()
        key = _cache_key(input_digest)
        cached = _cached_bytes(key, input_digest)
        if cached is not None:
            _replace(preview, cached)
            updated += 1
            continue
        with TemporaryDirectory(dir=preview.parent) as temporary:
            candidate = Path(temporary) / preview.name
            for edge, quality, frames in ENCODE_SETTINGS:
                write_derivative(preview, candidate, edge, quality, frames, method=ENCODE_METHOD)
                data = candidate.read_bytes()
                if len(data) < MAX_BYTES:
                    try:
                        _store_artifact(key, input_digest, data)
                    except OSError as error:
                        _warn_cache(error)
                    candidate.replace(preview)
                    updated += 1
                    break
            else:
                raise ValueError(f"Gallery thumbnail exceeds {MAX_BYTES} bytes: {preview}")
    try:
        _save_state()
    except OSError as error:
        _warn_cache(error)
    return updated


if __name__ == "__main__":
    print(f"[preview-assets] optimized {sum(fit_previews(Path(arg)) for arg in sys.argv[1:])} thumbnails")
