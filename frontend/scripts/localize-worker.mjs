import fs from 'node:fs';
import path from 'node:path';
import {prepareLocalization} from './localize-pages.mjs';

const stage = process.argv[2];
const snapshot = JSON.parse(fs.readFileSync(path.join(stage, 'site-data.json'), 'utf8'));
const localizer = prepareLocalization(stage, snapshot);

process.on('message', async ({html, base, locale}) => {
  try {
    process.send({result: await localizer.render(html, base, locale)});
  } catch (error) {
    process.send({error: error.message});
  }
});
