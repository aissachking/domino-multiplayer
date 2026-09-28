import 'package:socket_io_client/socket_io_client.dart' as io;
class GameSocket{GameSocket(this.url,this.playerId);final String url;final String playerId;io.Socket? _socket;
void connect({required void Function(Map<String,dynamic>) onRoom,required void Function(Map<String,dynamic>) onGame}){_socket=io.io(url,io.OptionBuilder().setTransports(['websocket']).setAuth({'playerId':playerId}).enableReconnection().build())..on('room:state',(data)=>onRoom(Map<String,dynamic>.from(data as Map)))..on('game:state',(data)=>onGame(Map<String,dynamic>.from(data as Map)))..connect();}
void create(String name,int targetScore)=>_socket?.emit('room:create',{'name':name,'targetScore':targetScore});
void join(String code,String name)=>_socket?.emit('room:join',{'code':code,'name':name});
void addBot(String code,String difficulty)=>_socket?.emit('room:add-bot',{'code':code,'difficulty':difficulty});
void removeBot(String code,String playerId)=>_socket?.emit('room:remove-bot',{'code':code,'playerId':playerId});
void start(String code)=>_socket?.emit('game:start',{'code':code});
void play(String code,String tileId,String end)=>_socket?.emit('game:play',{'code':code,'tileId':tileId,'end':end});
void draw(String code)=>_socket?.emit('game:draw',{'code':code});
void pass(String code)=>_socket?.emit('game:pass',{'code':code});
void dispose()=>_socket?.dispose();}
