import {matchesCreationMethod} from '../archive/creation-method.js';
import {isGifWork} from '../archive/work-format.js';
const normalizedTag = value => String(value || '').trim().normalize('NFKC').toLocaleLowerCase();

// One predicate for the browse archive and the inline homepage. Roles intersect.
export function filterWorks(works,state,{scores=null,allowGif=false,tagLabel=tag=>tag}={}) {
  const characters=String(state.character||'').split(',').filter(Boolean);
  const tag = normalizedTag(state.tag);
  return works.filter(work =>
    matchesCreationMethod(work,state.creation) &&
    characters.every(id=>work.cids.includes(id)) &&
    (!state.type || (allowGif && state.type==='gif' ? isGifWork(work) : work.k.includes(state.type))) &&
    (!tag || work.tg?.some(value=>normalizedTag(value)===tag || normalizedTag(tagLabel(value))===tag)) &&
    (!scores || scores.has(work.id)));
}
