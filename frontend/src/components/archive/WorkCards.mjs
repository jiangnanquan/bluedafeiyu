import {renderWorkCard} from '../../../public/archive/work-card.js';
export function createWorkCards() {
  const card = (work, eager = false, priority = false) => renderWorkCard(work, {eager,priority});
  const grid = (list, cls = '', eager = false) => `<div class="work-grid masonry ${cls}">${list.map((work,i)=>card(work,i<(typeof eager==='number'?eager:eager?4:0),Boolean(eager)&&i===0)).join('')}</div>`;
  return {card,grid};
}
