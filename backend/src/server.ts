import 'dotenv/config';
import http from 'node:http';
import cors from 'cors';
import express from 'express';
import {Server,type Socket} from 'socket.io';
import {chooseMove} from '@daeef/ai';
import {RoomStore} from './rooms.js';
const app=express();
const allowedOrigins=process.env.CORS_ORIGIN?.split(',').map(v=>v.trim()).filter(Boolean)??true;
app.use(cors({origin:allowedOrigins}));
app.get('/health',(_request,response)=>response.status(200).json({status:'ok'}));
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:allowedOrigins}});
const rooms=new RoomStore();
const recentEvents=new Map<string,number>();
function guard(socket:Socket,operation:()=>void):void{const now=Date.now(),last=recentEvents.get(socket.id)??0;if(now-last<75){socket.emit('error:event',{code:'RATE_LIMITED',message:'Too many requests'});return}recentEvents.set(socket.id,now);try{operation()}catch(error){socket.emit('error:event',{code:'INVALID_ACTION',message:error instanceof Error?error.message:'Invalid action'})}}
function emitRoom(roomCode:string):void{const room=rooms.get(roomCode);io.to(roomCode).emit('room:state',rooms.summary(room));for(const socket of io.sockets.sockets.values()){const playerId=socket.data.playerId as string|undefined;if(playerId&&socket.rooms.has(roomCode)&&room.players.some(p=>p.id===playerId))socket.emit('game:state',rooms.viewFor(room,playerId))}}
function runBots(roomCode:string):void{const room=rooms.get(roomCode);while(room.phase==='playing'){const current=room.game?.players[room.game.current];const player=room.players.find(p=>p.id===current?.id);if(!current||!player||player.kind!=='bot')break;const move=chooseMove(room.game!,player.difficulty??'normal');if(move)rooms.action(room,player.id,'play',{tileId:move.tile.id,end:move.end});else if(room.game!.stock.length)rooms.action(room,player.id,'draw');else rooms.action(room,player.id,'pass')}emitRoom(roomCode)}
io.use((socket,next)=>{const supplied=socket.handshake.auth?.playerId;socket.data.playerId=typeof supplied==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(supplied)?supplied:socket.id;next()});
io.on('connection',socket=>{const playerId=socket.data.playerId as string;
 for(const room of rooms.findRoomsForPlayer(playerId)){socket.join(room.code);socket.emit('room:state',rooms.summary(room));if(room.game)socket.emit('game:state',rooms.viewFor(room,playerId))}
 socket.on('room:create',(data:{name?:string;targetScore?:number}={})=>guard(socket,()=>{const room=rooms.create(playerId,data.name?.slice(0,24)||'Player',data.targetScore??100);socket.join(room.code);emitRoom(room.code)}));
 socket.on('room:join',(data:{code?:string;name?:string}={})=>guard(socket,()=>{if(!data.code||!/^[A-Za-z0-9]{4}$/.test(data.code))throw new Error('Invalid room code');const room=rooms.join(data.code,playerId,data.name?.slice(0,24)||'Player');socket.join(room.code);emitRoom(room.code)}));
 socket.on('room:add-bot',(data:{code?:string;difficulty?:'easy'|'normal'|'hard'|'expert'}={})=>guard(socket,()=>{const room=rooms.get(data.code??'');if(room.hostId!==playerId)throw new Error('Only host can add bots');if(!data.difficulty||!['easy','normal','hard','expert'].includes(data.difficulty))throw new Error('Invalid bot difficulty');rooms.addBot(room,data.difficulty);emitRoom(room.code)}));
 socket.on('room:remove-bot',(data:{code?:string;playerId?:string}={})=>guard(socket,()=>{const room=rooms.get(data.code??'');if(room.hostId!==playerId)throw new Error('Only host can remove bots');rooms.removeBot(room,data.playerId??'');emitRoom(room.code)}));
 socket.on('game:start',(data:{code?:string}={})=>guard(socket,()=>{const room=rooms.get(data.code??'');rooms.start(room,playerId);emitRoom(room.code);runBots(room.code)}));
 socket.on('game:play',(data:{code?:string;tileId?:string;end?:'left'|'right'}={})=>guard(socket,()=>{if(!data.tileId||(data.end!=='left'&&data.end!=='right'))throw new Error('Invalid tile placement');const room=rooms.get(data.code??'');rooms.action(room,playerId,'play',{tileId:data.tileId,end:data.end});emitRoom(room.code);runBots(room.code)}));
 socket.on('game:draw',(data:{code?:string}={})=>guard(socket,()=>{const room=rooms.get(data.code??'');rooms.action(room,playerId,'draw');emitRoom(room.code)}));
 socket.on('game:pass',(data:{code?:string}={})=>guard(socket,()=>{const room=rooms.get(data.code??'');rooms.action(room,playerId,'pass');emitRoom(room.code);runBots(room.code)}));
 socket.on('disconnect',()=>{recentEvents.delete(socket.id);for(const room of rooms.disconnect(playerId))emitRoom(room.code)});
});
const port=Number(process.env.PORT??3000);server.listen(port,'0.0.0.0',()=>console.log(`Domino API listening on ${port}`));
