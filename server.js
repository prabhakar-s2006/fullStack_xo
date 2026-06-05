const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const db = new sqlite3.Database('./database.db');

db.serialize(() => {
    // Create Users table
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
    
    // Create Matches table
    db.run("CREATE TABLE IF NOT EXISTS matches (id INTEGER PRIMARY KEY AUTOINCREMENT, player1 TEXT, player2 TEXT, winner TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
});

// API Routes
app.post('/api/login', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "Username is required" });
    
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
            res.json({ message: "Logged in", user: row });
        } else {
            db.run("INSERT INTO users (username) VALUES (?)", [username], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: "User created", user: { id: this.lastID, username } });
            });
        }
    });
});

app.get('/api/history', (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: "Username is required" });
    
    db.all("SELECT * FROM matches WHERE player1 = ? OR player2 = ? ORDER BY created_at DESC", [username, username], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ history: rows });
    });
});

app.get('/api/search', (req, res) => {
    const { term } = req.query;
    if (!term) return res.json({ users: [] });
    // fuzzy search
    db.all("SELECT username FROM users WHERE username LIKE ?", [`%${term}%`], (err, rows) => {
         if (err) return res.status(500).json({ error: err.message });
         res.json({ users: rows });
    });
});

// Socket.io for Real-time multiplayer
let onlineUsers = {}; // socket.id -> { username, room, status }
let rooms = {}; // room -> { player1, player2, board, turn }
let waitingChallenges = {}; // challengeId -> { from, to }

io.on('connection', (socket) => {
    console.log('User connected: ', socket.id);
    
    socket.on('register', (username) => {
        onlineUsers[socket.id] = { username, status: 'idle' };
        io.emit('online_users', Object.values(onlineUsers).map(u => ({username: u.username, status: u.status})));
    });

    socket.on('disconnect', () => {
        const user = onlineUsers[socket.id];
        if (user) {
            console.log('User disconnected:', user.username);
            delete onlineUsers[socket.id];
            io.emit('online_users', Object.values(onlineUsers).map(u => ({username: u.username, status: u.status})));
        }
    });

    socket.on('challenge', (targetUsername) => {
        const challenger = onlineUsers[socket.id];
        if (!challenger) return;
        
        let targetSocketId = Object.keys(onlineUsers).find(id => onlineUsers[id].username === targetUsername);
        if (targetSocketId) {
            io.to(targetSocketId).emit('challenge_received', challenger.username);
        }
    });

    socket.on('challenge_response', ({ challenger, accept }) => {
        const target = onlineUsers[socket.id];
        let challengerSocketId = Object.keys(onlineUsers).find(id => onlineUsers[id].username === challenger);
        
        if (!challengerSocketId || !target) return;

        if (accept) {
            const roomName = `room_${challengerSocketId}_${socket.id}`;
            socket.join(roomName);
            io.sockets.sockets.get(challengerSocketId).join(roomName);
            
            onlineUsers[socket.id].status = 'playing';
            onlineUsers[challengerSocketId].status = 'playing';
            onlineUsers[socket.id].room = roomName;
            onlineUsers[challengerSocketId].room = roomName;
            
            rooms[roomName] = {
                player1: challenger, // X
                player2: target.username, // O
                board: ["", "", "", "", "", "", "", "", ""],
                turn: challenger
            };
            
            io.to(roomName).emit('game_start', { 
                player1: challenger,
                player2: target.username,
                room: roomName
            });
            
            io.emit('online_users', Object.values(onlineUsers).map(u => ({username: u.username, status: u.status})));
        } else {
            io.to(challengerSocketId).emit('challenge_rejected', target.username);
        }
    });

    socket.on('make_move', ({ room, index }) => {
        let game = rooms[room];
        if (!game) return;
        
        let currentUser = onlineUsers[socket.id];
        if (game.turn !== currentUser.username) return;
        if (game.board[index] !== "") return;
        
        // determine symbol
        let symbol = game.player1 === currentUser.username ? "X" : "O";
        game.board[index] = symbol;
        
        // Next turn
        game.turn = game.turn === game.player1 ? game.player2 : game.player1;
        
        io.to(room).emit('update_board', { board: game.board, turn: game.turn });
        
        checkWinCondition(game, room);
    });
    
    socket.on('leave_game', () => {
        let user = onlineUsers[socket.id];
        if (!user || user.status !== 'playing') return;
        
        let room = user.room;
        if(rooms[room]) {
            let game = rooms[room];
            let winner = game.player1 === user.username ? game.player2 : game.player1;
            
            io.to(room).emit('game_over', { winner: winner, reason: "Opponent left" });
            
            saveMatch(game.player1, game.player2, winner);
            
            cleanupRoom(room);
        }
    });

});

function checkWinCondition(game, room) {
    let b = game.board;
    const winCombos = [
        [0,1,2],[3,4,5],[6,7,8],
        [0,3,6],[1,4,7],[2,5,8],
        [0,4,8],[2,4,6]
    ];
    
    let winnerSymbol = null;
    let winPattern = null;
    for (let c of winCombos) {
        if (b[c[0]] && b[c[0]] === b[c[1]] && b[c[0]] === b[c[2]]) {
            winnerSymbol = b[c[0]];
            winPattern = c;
            break;
        }
    }
    
    if (winnerSymbol) {
        let winner = winnerSymbol === "X" ? game.player1 : game.player2;
        io.to(room).emit('game_over', { winner, winPattern });
        saveMatch(game.player1, game.player2, winner);
        cleanupRoom(room);
    } else if (!b.includes("")) {
        io.to(room).emit('game_over', { winner: 'Draw' });
        saveMatch(game.player1, game.player2, 'Draw');
        cleanupRoom(room);
    }
}

function saveMatch(p1, p2, winner) {
    db.run("INSERT INTO matches (player1, player2, winner) VALUES (?, ?, ?)", [p1, p2, winner]);
}

function cleanupRoom(room) {
    let clients = io.sockets.adapter.rooms.get(room);
    if (clients) {
        for (let clientId of clients) {
            let socket = io.sockets.sockets.get(clientId);
            if (socket) {
                socket.leave(room);
                if (onlineUsers[clientId]) {
                    onlineUsers[clientId].status = 'idle';
                    onlineUsers[clientId].room = null;
                }
            }
        }
    }
    delete rooms[room];
    io.emit('online_users', Object.values(onlineUsers).map(u => ({username: u.username, status: u.status})));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
