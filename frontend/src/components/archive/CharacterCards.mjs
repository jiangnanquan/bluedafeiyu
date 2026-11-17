import {resolveCharacterPortrait} from './CharacterPortrait.mjs';
export function createCharacterCards(ctx) {
  const { editorial, esc, old, icon, card } = ctx;
const roleCover = c => c.list.find(w=>w.slug===editorial.characterCovers[c.id]) || c.list.find(w=>w.k.includes('setting')) || c.list.find(w=>w.k.includes('illustration')) || c.list[0] || {i:'/avatar.png',w:96,h:96,col:'var(--blue)',cs:'var(--blue-pale)',n:c.name,placeholder:true};
const roleCard = c => { const w=roleCover(c), {image}=resolveCharacterPortrait(c,w), href='/characters/'+c.id+'.html'; return `<article class="role-card"><a class="role-art" href="${href}"><img src="${esc(image?.path||w.i)}" width="${image?.width||w.w}" height="${image?.height||w.h}" alt="${esc(c.name)}" loading="lazy" decoding="async"></a><div class="role-body"><h3><a href="${href}">${esc(c.name)}</a></h3><a class="role-count" href="${href}">${c.list.length} ${old('v2.work','作品')}<span data-character-aliases>${c.aliases.length?' · '+esc(c.aliases.slice(0,2).join('/')):''}</span></a></div></article>`; };

  return { roleCover, roleCard };
}
