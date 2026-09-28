import {type End,type GameState,type Tile,legalEnds,legalTiles} from '@daeef/game-engine';import type {Difficulty} from '@daeef/shared';
export interface BotMove{tile:Tile;end:End}
const sum=(t:Tile)=>t.a+t.b;
export function chooseMove(state:GameState,difficulty:Difficulty,random:()=>number=Math.random):BotMove|undefined{
 const choices=legalTiles(state).flatMap(tile=>legalEnds(state,tile).map(end=>({tile,end})));if(!choices.length)return undefined;
 if(difficulty==='easy')return choices[Math.floor(random()*choices.length)];
 const hand=state.players[state.current].hand;
 const score=({tile,end}:BotMove)=>{const remaining=hand.filter(t=>t.id!==tile.id);const exposed=end==='left'?(tile.a===state.board[0]?.left?tile.b:tile.a):(tile.a===state.board.at(-1)?.right?tile.b:tile.a);const support=remaining.filter(t=>t.a===exposed||t.b===exposed).length;return sum(tile)+(tile.a===tile.b?5:0)+support*(difficulty==='expert'?4:difficulty==='hard'?2:1)};
 return choices.sort((a,b)=>score(b)-score(a))[0];
}