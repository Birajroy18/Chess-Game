const socket = io();
const chess = new Chess();
const boardElement = document.querySelector(".chessboard");

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;

const renderBoard = () => {
    const board = chess.board();
    boardElement.innerHTML = "";
    board.forEach((row, rowindex) => {
        row.forEach((square, squareindex) => {
            const squareElement = document.createElement("div");
            squareElement.classList.add("square",
                (rowindex + squareindex) % 2 === 0 ? "light" : "dark"
            );
            squareElement.dataset.row = rowindex;
            squareElement.dataset.col = squareindex;

            if (square) {
                const pieceElement = document.createElement("div");
                pieceElement.classList.add("piece", square.color === 'w' ? "white" : "black");

                pieceElement.innerText = getPieceUnicode(square);
                pieceElement.draggable = playerRole === square.color;
                pieceElement.addEventListener("dragstart", (e) => {
                    if (pieceElement.draggable) {
                        console.log("Drag started for piece at:", rowindex, squareindex);
                        draggedPiece = pieceElement;
                        sourceSquare = { row: rowindex, col: squareindex };
                        e.dataTransfer.setData("text/plain", "");
                        pieceElement.classList.add("dragging");
                    }
                });
                pieceElement.addEventListener("dragend", (e) => {
                    console.log("Drag ended");
                    draggedPiece = null;
                    sourceSquare = null;
                    pieceElement.classList.remove("dragging");
                });
                squareElement.appendChild(pieceElement);
            }


            squareElement.addEventListener("dragover", function (e) {
                e.preventDefault();
            });
            squareElement.addEventListener("drop", function (e) {
                e.preventDefault();
                console.log("Drop event triggered");
                if (draggedPiece) {
                    const targetSource = {
                        row: parseInt(squareElement.dataset.row),
                        col: parseInt(squareElement.dataset.col),
                    };

                    console.log("Dropping from", sourceSquare, "to", targetSource);
                    handleMove(sourceSquare, targetSource);
                }
            });
            boardElement.appendChild(squareElement);
        });
    });

    if(playerRole ==='b'){
        boardElement.classList.add("flipped");
    }
    else{
        boardElement.classList.remove("flipped");
    }


};

const handleMove = (source, target) => {
    const move = {
        from: `${String.fromCharCode(97 + source.col)}${8 - source.row}`,
        to: `${String.fromCharCode(97 + target.col)}${8 - target.row}`,
        promotion: 'q',
    };

    console.log("Attempting move:", move, "Player role:", playerRole);
    
    if (chess.move(move)) {
        socket.emit("move", move);
        renderBoard();
        if (typeof showStatusMessage === 'function') {
            showStatusMessage("Move made! Waiting for opponent...", "info");
        }
    } else {
        console.log("Invalid move:", move);
        if (typeof showStatusMessage === 'function') {
            showStatusMessage("Invalid move!", "error");
        }
    }
};


const getPieceUnicode = (piece) => {
    const unicodePieces = {
        k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♙", // black
        K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙", // white
    };
    return unicodePieces[piece.type] || " ";
};

socket.on("playerRole", function (role) {
    playerRole = role;
    console.log("Assigned player role:", role);
    renderBoard();
});

socket.on("spectatorRole", function () {
    playerRole = null;
    // Don't render board immediately for spectators
    // Wait for gameActive or noActiveGame event to determine what to show
});

socket.on("waitingForOpponent", function () {
    console.log("Waiting for opponent to join...");
    if (typeof showWaitingMessage === 'function') {
        showWaitingMessage();
    }
});

socket.on("gameStart", function () {
    console.log("Game started!");
    if (typeof showGame === 'function') {
        showGame();
    }
    if (typeof showStatusMessage === 'function') {
        showStatusMessage("Game started! Your turn.", "info");
    }
});

socket.on("gameActive", function () {
    console.log("Joining active game as spectator");
    renderBoard(); // Render the board for active game
    if (typeof showGame === 'function') {
        showGame();
    }
    if (typeof showStatusMessage === 'function') {
        showStatusMessage("Joined as spectator", "info");
    }
});

socket.on("noActiveGame", function () {
    console.log("No active game to spectate");
    // Hide any game-related content
    if (typeof showNoGameMessage === 'function') {
        showNoGameMessage();
    }
    if (typeof showStatusMessage === 'function') {
        showStatusMessage("No active games to spectate", "info");
    }
});

socket.on("boardState", function (fen) {
    chess.load(fen);
    renderBoard();
});

socket.on("move", function (move) {
    chess.move(move);
    renderBoard();
    // Only show "opponent made a move" message if it's now this player's turn
    if (playerRole && chess.turn() === playerRole && typeof showStatusMessage === 'function') {
        showStatusMessage("Opponent made a move! Your turn.", "info");
    }
});

// Don't render board initially - wait for role assignment
// Players will get board rendered in playerRole event
// Spectators will get board rendered in gameActive event