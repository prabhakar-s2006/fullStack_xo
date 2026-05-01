const socket = io();

// State
let state = {
    username: null,
    currentRoom: null,
    turn: null,
    symbol: null
};

// DOM Elements
const screens = {
    login: document.getElementById('login-screen'),
    dashboard: document.getElementById('dashboard-screen'),
    game: document.getElementById('game-screen')
};

function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

// --- Login & Setup ---
const loginBtn = document.getElementById('login-btn');
const usernameInput = document.getElementById('username-input');
const loginError = document.getElementById('login-error');
const currentUsernameDisplay = document.getElementById('current-username');

loginBtn.addEventListener('click', async () => {
    const val = usernameInput.value.trim();
    if (!val) {
        loginError.innerText = "Please enter a username!";
        return;
    }
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: val })
        });
        const data = await res.json();
        
        if (res.ok) {
            state.username = data.user.username;
            currentUsernameDisplay.innerText = state.username;
            socket.emit('register', state.username);
            showScreen('dashboard');
            fetchHistory(state.username);
        } else {
            loginError.innerText = data.error;
        }
    } catch (e) {
        loginError.innerText = "Connection error.";
    }
});

document.getElementById('logout-btn').addEventListener('click', () => {
    location.reload(); // simple reset
});

// --- Dashboard / Lobby ---
const onlineUsersList = document.getElementById('online-users-list');

socket.on('online_users', (users) => {
    onlineUsersList.innerHTML = '';
    users.forEach(u => {
        if (u.username === state.username) return; // skip self
        
        const li = document.createElement('li');
        li.innerHTML = `
            <div>
                <strong>${u.username}</strong>
                <span style="color: ${u.status === 'idle' ? '#10b981' : '#f59e0b'}; font-size: 0.8rem; margin-left: 0.5rem">
                    ${u.status}
                </span>
            </div>
        `;
        
        if (u.status === 'idle') {
            const btn = document.createElement('button');
            btn.className = 'btn small primary';
            btn.innerText = 'Challenge';
            btn.onclick = () => {
                btn.innerText = 'Waiting...';
                btn.disabled = true;
                socket.emit('challenge', u.username);
            };
            li.appendChild(btn);
        }
        
        onlineUsersList.appendChild(li);
    });
});

// --- Search & History ---
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResultsList = document.getElementById('search-results-list');
const historyList = document.getElementById('history-list');

searchBtn.addEventListener('click', async () => {
    const val = searchInput.value.trim();
    if(!val) {
        searchResultsList.innerHTML = '';
        fetchHistory(state.username); // switch back to own history
        return;
    }
    
    const res = await fetch(`/api/search?term=${encodeURIComponent(val)}`);
    const data = await res.json();
    
    searchResultsList.innerHTML = '';
    data.users.forEach(u => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${u.username}</span> <button class="btn small">View History</button>`;
        li.querySelector('button').onclick = () => fetchHistory(u.username);
        searchResultsList.appendChild(li);
    });
});

async function fetchHistory(username) {
    const res = await fetch(`/api/history?username=${encodeURIComponent(username)}`);
    const data = await res.json();
    
    historyList.innerHTML = '';
    if(data.history.length === 0) {
        historyList.innerHTML = '<li>No match history found.</li>';
        return;
    }
    
    data.history.forEach(m => {
        const li = document.createElement('li');
        const isWin = m.winner === username;
        const isDraw = m.winner === 'Draw';
        let status = isDraw ? 'Draw' : (isWin ? 'Won' : 'Lost');
        let color = isDraw ? '#94a3b8' : (isWin ? '#10b981' : '#ef4444');
        
        li.innerHTML = `
            <div>
                <strong>${m.player1} vs ${m.player2}</strong>
                <div style="font-size: 0.8rem; color: #94a3b8">${new Date(m.created_at).toLocaleString()}</div>
            </div>
            <div style="color: ${color}; font-weight: bold;">${status}</div>
        `;
        historyList.appendChild(li);
    });
}

// --- Challenges ---
const challengeModal = document.getElementById('challenge-modal');
const challengerNameDisplay = document.getElementById('challenger-name');
let pendingChallenger = null;

socket.on('challenge_received', (challengerUsername) => {
    pendingChallenger = challengerUsername;
    challengerNameDisplay.innerText = challengerUsername;
    challengeModal.classList.add('active');
});

socket.on('challenge_rejected', (targetUsername) => {
    alert(`${targetUsername} declined your challenge.`);
    // buttons reset via online_users update
});

document.getElementById('accept-challenge').addEventListener('click', () => {
    challengeModal.classList.remove('active');
    socket.emit('challenge_response', { challenger: pendingChallenger, accept: true });
    pendingChallenger = null;
});

document.getElementById('reject-challenge').addEventListener('click', () => {
    challengeModal.classList.remove('active');
    socket.emit('challenge_response', { challenger: pendingChallenger, accept: false });
    pendingChallenger = null;
});


// --- Game Loop ---
const playerXName = document.getElementById('player-x-name');
const playerOName = document.getElementById('player-o-name');
const gameStatus = document.getElementById('game-status');
const cells = document.querySelectorAll('.cell');

socket.on('game_start', (data) => {
    state.currentRoom = data.room;
    state.turn = data.player1;
    state.symbol = data.player1 === state.username ? 'X' : 'O';
    
    playerXName.innerText = data.player1;
    playerOName.innerText = data.player2;
    
    // reset board UI
    cells.forEach(c => {
        c.innerText = '';
        c.className = 'cell';
        c.dataset.symbol = '';
    });
    
    updateGameStatus();
    showScreen('game');
});

socket.on('update_board', (data) => {
    data.board.forEach((val, i) => {
        cells[i].innerText = val;
        cells[i].dataset.symbol = val;
    });
    state.turn = data.turn;
    updateGameStatus();
});

socket.on('game_over', (data) => {
    if (data.winPattern) {
        data.winPattern.forEach(i => cells[i].classList.add('win'));
        gameStatus.innerText = `${data.winner} Wins!`;
    } else if (data.winner === 'Draw') {
        gameStatus.innerText = "It's a Draw!";
    } else {
        gameStatus.innerText = `${data.winner} Wins! (${data.reason})`;
    }
    
    setTimeout(() => {
        alert("Game Over! Returning to lobby.");
        state.currentRoom = null;
        showScreen('dashboard');
        fetchHistory(state.username);
    }, 3000);
});

cells.forEach(cell => {
    cell.addEventListener('click', () => {
        if (!state.currentRoom) return;
        if (state.turn !== state.username) return;
        
        const index = parseInt(cell.dataset.index);
        if (cell.innerText !== "") return;
        
        socket.emit('make_move', { room: state.currentRoom, index });
    });
});

document.getElementById('leave-btn').addEventListener('click', () => {
    socket.emit('leave_game');
    state.currentRoom = null;
    showScreen('dashboard');
});

function updateGameStatus() {
    if (state.turn === state.username) {
        gameStatus.innerText = "Your Turn!";
        gameStatus.style.color = "#10b981";
    } else {
        gameStatus.innerText = "Opponent's Turn...";
        gameStatus.style.color = "#f59e0b";
    }
}
