import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {hash, copyArtifact, copyImmutableAsset} from './incremental.mjs';

function sourceDigest(image, assets, placeholderDigest) {
  if (typeof image !== 'string' || !image) return null;
  const pathname = image.split(/[?#]/, 1)[0];
  if (path.posix.basename(pathname) === 'image-placeholder.svg') return placeholderDigest;
  if (/^http/i.test(image)) return null;
  try {
    return assets['dist/' + decodeURIComponent(image.replace(/^\/+/, ''))]?.digest ?? null;
  } catch { return null; }
}

export function buildShareCards({jobsFile, root, dist, stage, previous, state, inputs, assets, knownOutputs}) {
  const jobs = [...new Map(fs.readFileSync(jobsFile, 'utf8').split('\n').filter(Boolean)
    .map(line => JSON.parse(line)).map(job => [job.id, job])).values()];
  const fingerprint = hash([jobs, inputs.og, inputs.assets, inputs.runtime]);
  const renderer = hash([inputs.og, inputs.runtime, assets['dist/avatar.png']?.digest]);
  const jobKeys = {};
  const dirty = [];
  let reused = 0;
  for (const job of jobs) {
    const name = 'og/' + job.id + '.jpg';
    const digest = sourceDigest(job.img, assets, inputs.og);
    const key = digest ? hash([job, renderer, digest]) : null;
    if (key) jobKeys[job.id] = key;
    const prior = state?.outputs[name];
    if (prior && (state.ogFingerprint === fingerprint || (key && state.ogJobs?.[job.id] === key))) {
      copyArtifact(previous, stage, name);
      knownOutputs.set(name, prior);
      reused++;
    } else {
      dirty.push(job);
    }
  }
  if (dirty.length) {
    const cache = path.join(root, '.build/og-cache');
    fs.mkdirSync(cache, {recursive: true});
    const jobsJson = path.join(cache, 'jobs.json');
    fs.writeFileSync(jobsJson, JSON.stringify(dirty));
    const result = spawnSync(process.env.PYTHON || 'python3',
      [path.join(root, 'tools/og_cards.py'), jobsJson, cache, dist, path.join(dist, 'avatar.png')],
      {cwd: root, stdio: 'inherit'});
    if (result.error || result.status !== 0) throw Error('Share card generation failed: ' + (result.error?.message || result.status));
    for (const job of dirty) {
      const name = 'og/' + job.id + '.jpg', digest = state?.outputs[name];
      if (copyImmutableAsset(path.join(cache, job.id + '.jpg'), path.join(stage, name), path.join(previous, name), digest)) {
        if (digest) knownOutputs.set(name, digest);
      }
    }
  }
  console.log(`[og] ${dirty.length} jobs checked, ${reused} share cards reused`);
  return {fingerprint, jobKeys, reused, checked: dirty.length};
}
