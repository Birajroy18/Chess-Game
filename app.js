const express = require("express");
const socket = require("socket.io");
const http = require("http");
const {Chess} = require("chess.js")
const path = require("path");

const app=express();
const server = http.createServer(app);

const io = socket(server);

// Room management
const rooms = {}; // roomId -> { chess, players: {white, black}, spectators: [], gameActive: boolean }
let randomQueue = null; // store pending socket id waiting for random match

function createRoom() {
    const roomId = Math.random().toString(36).slice(2, 10);
    rooms[roomId] = {
        chess: new Chess(),
        players: {},
        spectators: [],
        gameActive: false,
    };
    return roomId;
}

app.set("view engine","ejs");
app.use(express.static(path.join(__dirname,"public")));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get("/", (req,res) =>{
    res.render("index",{title:"Chess Game"});
});

app.get("/game", (req,res) =>{
    res.render("game",{title:"Chess Game"});
});

// Create a room via HTTP for convenience (used by host flow)
app.get('/create-room', (req, res) => {
    const roomId = createRoom();
    res.json({ roomId });
});

io.on("connection",function (uniquesocket){
    console.log("connected");
    
    // Room-based join
    uniquesocket.on('joinRoom', ({ roomId, as }) => {
        if (!roomId || !rooms[roomId]) {
            // Auto-create if host without room
            if (as === 'host') {
                roomId = createRoom();
            } else {
                // Handle random matchmaking
                if (roomId === 'random' && as === 'player') {
                    if (!randomQueue) {
                        randomQueue = uniquesocket.id;
                        // Create a provisional room and assign as white
                        const newRoomId = createRoom();
                        const room = rooms[newRoomId];
                        uniquesocket.join(newRoomId);
                        room.players.white = uniquesocket.id;
                        uniquesocket.emit('playerRole', 'w');
                        uniquesocket.emit('waitingForOpponent', true);
                        uniquesocket.emit('joinedRoom', { roomId: newRoomId });
                        return;
                    } else {
                        // Pair with waiting player
                        const newRoomId = Object.entries(rooms).find(([id, r]) => r.players.white === randomQueue && !r.players.black)?.[0];
                        if (!newRoomId) {
                            // Fallback: create a new room if something went wrong
                            const fallbackId = createRoom();
                            const room = rooms[fallbackId];
                            uniquesocket.join(fallbackId);
                            room.players.black = uniquesocket.id;
                            uniquesocket.emit('playerRole', 'b');
                            room.gameActive = true;
                            io.to(fallbackId).emit('gameStart', true);
                            uniquesocket.emit('joinedRoom', { roomId: fallbackId });
                        } else {
                            const room = rooms[newRoomId];
                            uniquesocket.join(newRoomId);
                            room.players.black = uniquesocket.id;
                            uniquesocket.emit('playerRole', 'b');
                            room.gameActive = true;
                            io.to(room.players.white).emit('gameStart', true);
                            io.to(room.players.black).emit('gameStart', true);
                            io.to(newRoomId).emit('boardState', room.chess.fen());
                            io.to(newRoomId).emit('joinedRoom', { roomId: newRoomId });
                        }
                        randomQueue = null;
                        return;
                    }
                }
                if (roomId && roomId !== 'random') {
                    uniquesocket.emit('roomClosed', { roomId });
                } else {
                    uniquesocket.emit('noActiveGame', true);
                }
                return;
            }
        }

        const room = rooms[roomId];
        uniquesocket.join(roomId);

        if (as === 'host') {
            if (!room.players.white) {
                room.players.white = uniquesocket.id;
                uniquesocket.emit('playerRole', 'w');
                uniquesocket.emit('waitingForOpponent', true);
            } else {
                uniquesocket.emit('spectatorRole');
            }
        } else if (as === 'player') {
            if (!room.players.black) {
                room.players.black = uniquesocket.id;
                uniquesocket.emit('playerRole', 'b');
                room.gameActive = true;
                io.to(room.players.white).emit('gameStart', true);
                io.to(room.players.black).emit('gameStart', true);
                room.spectators.forEach(specId => io.to(specId).emit('gameActive', true));
            } else {
                // slot filled, become spectator
                room.spectators.push(uniquesocket.id);
                uniquesocket.emit('spectatorRole');
                if (room.gameActive) uniquesocket.emit('gameActive', true); else uniquesocket.emit('noActiveGame', true);
            }
        } else {
            room.spectators.push(uniquesocket.id);
            uniquesocket.emit('spectatorRole');
            if (room.gameActive) uniquesocket.emit('gameActive', true); else uniquesocket.emit('noActiveGame', true);
        }

        // Send current board state to anyone joining
        uniquesocket.emit('boardState', room.chess.fen());
        uniquesocket.emit('joinedRoom', { roomId });
    });

    uniquesocket.on("disconnect",function(){
        // Clean up from any rooms this socket was in
        for (const [roomId, room] of Object.entries(rooms)) {
            if (room.players.white === uniquesocket.id) {
                const opponentId = room.players.black;
                delete room.players.white;
                room.gameActive = false;
                console.log(`[disconnect] White player left room ${roomId}: ${uniquesocket.id}`);
                if (opponentId) {
                    io.to(opponentId).emit('opponentLeft', { roomId });
                }
                // Close room and notify remaining members
                io.to(roomId).emit('roomClosed', { roomId });
                delete rooms[roomId];
            }
            if (room.players.black === uniquesocket.id) {
                const opponentId = room.players.white;
                delete room.players.black;
                room.gameActive = false;
                console.log(`[disconnect] Black player left room ${roomId}: ${uniquesocket.id}`);
                if (opponentId) {
                    io.to(opponentId).emit('opponentLeft', { roomId });
                }
            }
            const idx = room.spectators.indexOf(uniquesocket.id);
            if (idx > -1) room.spectators.splice(idx, 1);

            if (rooms[roomId] && !room.gameActive && !room.players.white && !room.players.black) {
                room.spectators.forEach(specId => io.to(specId).emit('roomClosed', { roomId }));
                console.log(`[room] Room ${roomId} no longer active, deleting`);
                delete rooms[roomId];
            }
        }
        if (randomQueue === uniquesocket.id) {
            randomQueue = null;
            console.log(`[queue] Cleared random queue; disconnected socket ${uniquesocket.id}`);
        }
    });

        uniquesocket.on("move",(move)=>{
        try{
            const { roomId } = move;
            const room = roomId ? rooms[roomId] : null;
            if (!room) { return; }

            console.log("Received move:", move, "in room:", roomId, "from:", uniquesocket.id);
            console.log("Current turn:", room.chess.turn(), "White:", room.players.white, "Black:", room.players.black);
            
            if(room.chess.turn()=== 'w' && uniquesocket.id !== room.players.white) {
                console.log("Not white player's turn");
                return;
            }
            if(room.chess.turn() === 'b' && uniquesocket.id !== room.players.black) {
                console.log("Not black player's turn");
                return;
            }

            const result = room.chess.move({ from: move.from, to: move.to, promotion: move.promotion });
            if(result){
                console.log("Move successful, broadcasting to room", roomId);
                io.to(roomId).emit("move", { from: move.from, to: move.to, promotion: move.promotion });
                io.to(roomId).emit("boardState", room.chess.fen());
            }else{
                console.log("invalid move:", move);
                uniquesocket.emit("invalid move",move)
            }

        }catch(err){
            console.log(err);
            uniquesocket.emit("Invalid move:",move);
        }
    });
});

server.listen(3000,function(){
    console.log("listening on port 3000");
});