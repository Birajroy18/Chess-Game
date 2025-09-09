const socket = io();
const chess = new Chess();
const boardElement = document.querySelector(".chessboard");

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;
let selectedSquare = null;
let validMoves = [];

// Check if device supports touch
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

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
                pieceElement.draggable = playerRole === square.color && chess.turn() === playerRole && !isTouchDevice;
                pieceElement.dataset.row = rowindex;
                pieceElement.dataset.col = squareindex;
                
                // Desktop drag and drop
                if (!isTouchDevice) {
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
                    // Click-to-select for desktop
                    pieceElement.addEventListener("click", (e) => {
                        e.preventDefault();
                        handleTouchStart(rowindex, squareindex, pieceElement);
                    });
                }
                
                // Touch interactions for mobile
                if (isTouchDevice && playerRole === square.color) {
                    pieceElement.addEventListener("touchstart", (e) => {
                        e.preventDefault();
                        handleTouchStart(rowindex, squareindex, pieceElement);
                    });
                }
                
                squareElement.appendChild(pieceElement);
            }

            // Desktop drop handling
            if (!isTouchDevice) {
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
                // Click-to-move using highlighted squares on desktop
                squareElement.addEventListener("click", (e) => {
                    e.preventDefault();
                    handleSquareTouch(rowindex, squareindex, squareElement);
                });
            }
            
            // Touch interactions for squares
            if (isTouchDevice) {
                squareElement.addEventListener("touchstart", (e) => {
                    e.preventDefault();
                    handleSquareTouch(rowindex, squareindex, squareElement);
                });
            }

            boardElement.appendChild(squareElement);
        });
    });

    if(playerRole ==='b'){
        boardElement.classList.add("flipped");
    }
    else{
        boardElement.classList.remove("flipped");
    }
    
    // Highlight selected square and valid moves
    highlightSelection();
};

const handleTouchStart = (row, col, pieceElement) => {
    console.log("Touch started for piece at:", row, col);
    
    // Do not allow interaction if it's not the player's turn (silent)
    if (!playerRole || chess.turn() !== playerRole) {
        clearSelection();
        return;
    }
    
    // Clear previous selection
    clearSelection();
    
    // Select this piece
    selectedSquare = { row, col };
    validMoves = getValidMoves(row, col);
    
    // Highlight selection
    highlightSelection();
    // no selection message
};

const handleSquareTouch = (row, col, squareElement) => {
    console.log("Square touched at:", row, col);
    
    // If it's opponent's turn, only show a message when a move is attempted
    if (!playerRole || chess.turn() !== playerRole) {
        if (selectedSquare) {
            if (typeof showStatusMessage === 'function') {
                showStatusMessage("Wrong move. Opponent's turn.", "error");
            }
            clearSelection();
        }
        return;
    }
    
    if (selectedSquare) {
        // Check if this is a valid move
        const isValidMove = validMoves.some(move => 
            move.row === row && move.col === col
        );
        
        if (isValidMove) {
            handleMove(selectedSquare, { row, col });
            clearSelection();
        } else {
            // Select new piece if it's the player's piece
            const piece = chess.get(`${String.fromCharCode(97 + col)}${8 - row}`);
            if (piece && piece.color === playerRole) {
                handleTouchStart(row, col, squareElement.querySelector('.piece'));
            } else {
                clearSelection();
            }
        }
    } else {
        // Try to select a piece
        const piece = chess.get(`${String.fromCharCode(97 + col)}${8 - row}`);
        if (piece && piece.color === playerRole) {
            handleTouchStart(row, col, squareElement.querySelector('.piece'));
        }
    }
};

const getValidMoves = (row, col) => {
    const square = `${String.fromCharCode(97 + col)}${8 - row}`;
    const moves = chess.moves({ square, verbose: true });
    return moves.map(move => ({
        row: 8 - parseInt(move.to[1]),
        col: move.to.charCodeAt(0) - 97
    }));
};

const clearSelection = () => {
    selectedSquare = null;
    validMoves = [];
    highlightSelection();
};

const highlightSelection = () => {
    // Remove all existing highlights
    document.querySelectorAll('.square').forEach(square => {
        square.classList.remove('selected', 'valid-move');
    });
    
    // Highlight selected square
    if (selectedSquare) {
        const selectedElement = document.querySelector(
            `[data-row="${selectedSquare.row}"][data-col="${selectedSquare.col}"]`
        );
        if (selectedElement) {
            selectedElement.classList.add('selected');
        }
        
        // Highlight valid moves
        validMoves.forEach(move => {
            const moveElement = document.querySelector(
                `[data-row="${move.row}"][data-col="${move.col}"]`
            );
            if (moveElement) {
                moveElement.classList.add('valid-move');
            }
        });
    }
};

const handleMove = (source, target) => {
    const url = new URLSearchParams(window.location.search);
    const move = {
        from: `${String.fromCharCode(97 + source.col)}${8 - source.row}`,
        to: `${String.fromCharCode(97 + target.col)}${8 - target.row}`,
        promotion: 'q',
        roomId: url.get('roomId') || undefined,
    };

    console.log("Attempting move:", move, "Player role:", playerRole);
    
    // Prevent moves when it's not the player's turn
    if (!playerRole || chess.turn() !== playerRole) {
        if (typeof showStatusMessage === 'function') {
            showStatusMessage("Wrong move. Opponent's turn.", "error");
        }
        clearSelection();
        return;
    }
    
    if (chess.move(move)) {
        socket.emit("move", move);
        renderBoard();
        // No auto status message after move
    } else {
        handleMoveError(move);
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
    if (typeof showStatusMessage === 'function' && playerRole && chess.turn() === playerRole) {
        showStatusMessage("Game started! Your turn.", "info");
    }
});

socket.on("gameActive", function () {
    console.log("Joining active game as spectator");
    renderBoard(); 
    if (typeof showGame === 'function') {
        showGame();
    }
    if (typeof showStatusMessage === 'function') {
        showStatusMessage("Joined as spectator", "info");
    }
});

socket.on("noActiveGame", function () {
    console.log("No active game to spectate");
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
    // Do not auto-show turn messages
});

// Notify when opponent leaves
socket.on('opponentLeft', function () {
    if (typeof showStatusMessage === 'function') {
        showStatusMessage("You win! Opponent left the game.", "error");
    }
});

// Mobile-specific optimizations
if (isTouchDevice) {
    // Prevent double-tap zoom
    let lastTouchEnd = 0;
    document.addEventListener('touchend', function (event) {
        const now = (new Date()).getTime();
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    }, false);
    
    // Handle orientation changes
    window.addEventListener('orientationchange', function() {
        setTimeout(() => {
            renderBoard();
        }, 100);
    });
    
    // Handle resize events for responsive design
    window.addEventListener('resize', function() {
        setTimeout(() => {
            renderBoard();
        }, 100);
    });
}

// Add loading state management
const setLoadingState = (loading) => {
    if (boardElement) {
        if (loading) {
            boardElement.classList.add('loading');
        } else {
            boardElement.classList.remove('loading');
        }
    }
};

// Improve error handling for mobile
const handleMoveError = (move) => {
    console.log("Invalid move:", move);
    if (typeof showStatusMessage === 'function') {
        showStatusMessage("Invalid move! Try again.", "error");
    }
    
    // Clear selection on error
    clearSelection();
    
    // Add visual feedback
    if (selectedSquare) {
        const selectedElement = document.querySelector(
            `[data-row="${selectedSquare.row}"][data-col="${selectedSquare.col}"]`
        );
        if (selectedElement) {
            selectedElement.classList.add('invalid-move');
            setTimeout(() => {
                selectedElement.classList.remove('invalid-move');
            }, 1000);
        }
    }
};
