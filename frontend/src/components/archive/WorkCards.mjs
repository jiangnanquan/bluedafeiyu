import {renderWorkCard} from '../../../public/archive/work-card.js';
import {initialMasonryScript} from '../layout/Masonry.mjs';
export function createWorkCards() {
  const card = (work, eager = false, priority = false) => renderWorkCard(work, {eager,priority});
  const grid = (list, cls = '', eager = false) => `<div class="work-grid ${cls}">${list.map((work,i)=>card(work,i<(typeof eager==='number'?eager:eager?4:0),Boolean(eager)&&i===0)).join('')}</div>${initialMasonryScript()}`;
  return {card,grid};
}
