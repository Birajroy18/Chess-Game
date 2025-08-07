const express = require("express");
const socket = require("socket.io");
const http = require("http");
const {Chess} = require("chess.js")
const path = require("path");

const app=express();
const server = http.createServer(app);

const io = socket(server);

const chess = new Chess();

let players = {};
let spectators = [];
let gameActive = false;
let CurrentPlayer = "w";

app.set("view engine","ejs");
app.use(express.static(path.join(__dirname,"public")));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get("/", (req,res) =>{
    res.render("index",{title:"Chess Game"});
});

app.get("/game", (req,res) =>{
    res.render("game",{title:"Chess Game"});
});

io.on("connection",function (uniquesocket){
    console.log("connected");
    
    // Wait for client to specify their role
    uniquesocket.on("joinAsPlayer", function() {
        console.log("Client wants to join as player");
        
        if (!players.white) {
            // First player joins
            players.white = uniquesocket.id;
            uniquesocket.emit("playerRole", "w");
            uniquesocket.emit("waitingForOpponent", true);
            console.log("White player joined, waiting for opponent");
        } else if (!players.black) {
            // Second player joins
            players.black = uniquesocket.id;
            uniquesocket.emit("playerRole", "b");
            gameActive = true;
            
            // Notify both players that game can start
            io.to(players.white).emit("gameStart", true);
            io.to(players.black).emit("gameStart", true);
            
            // Notify all spectators that game is active
            spectators.forEach(specId => {
                io.to(specId).emit("gameActive", true);
            });
            
            console.log("Black player joined, game started");
        } else {
            // Both player slots are full, add as spectator
            spectators.push(uniquesocket.id);
            uniquesocket.emit("spectatorRole");
            
            if (gameActive) {
                uniquesocket.emit("gameActive", true);
            } else {
                uniquesocket.emit("noActiveGame", true);
            }
            console.log("Player slot full, joined as spectator");
        }
    });
    
    uniquesocket.on("joinAsSpectator", function() {
        console.log("Client wants to join as spectator");
        
        spectators.push(uniquesocket.id);
        uniquesocket.emit("spectatorRole");
        
        if (gameActive) {
            uniquesocket.emit("gameActive", true);
            console.log("Spectator joined active game");
        } else {
            uniquesocket.emit("noActiveGame", true);
            console.log("Spectator joined, no active game");
        }
    });

    uniquesocket.on("disconnect",function(){
        if(uniquesocket.id === players.white){
            delete players.white;
            gameActive = false;
            console.log("White player disconnected");
        } else if(uniquesocket.id === players.black){
            delete players.black;
            gameActive = false;
            console.log("Black player disconnected");
        } else {
            // Remove from spectators
            const specIndex = spectators.indexOf(uniquesocket.id);
            if (specIndex > -1) {
                spectators.splice(specIndex, 1);
            }
        }
        
        // If game is no longer active, notify remaining spectators
        if (!gameActive) {
            spectators.forEach(specId => {
                io.to(specId).emit("noActiveGame", true);
            });
        }
    });

        uniquesocket.on("move",(move)=>{
        try{
            console.log("Received move:", move, "from player:", uniquesocket.id);
            console.log("Current turn:", chess.turn(), "White player:", players.white, "Black player:", players.black);
            
            if(chess.turn()=== 'w' && uniquesocket.id !== players.white) {
                console.log("Not white player's turn");
                return;
            }
            if(chess.turn() === 'b' && uniquesocket.id !== players.black) {
                console.log("Not black player's turn");
                return;
            }

            const result = chess.move(move);
            if(result){
                CurrentPlayer = chess.turn();
                console.log("Move successful, broadcasting to all players");
                io.emit("move",move);
                io.emit("boardState",chess.fen());
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