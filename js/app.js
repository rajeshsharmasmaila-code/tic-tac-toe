// ==========================================
// ELEMENTS
// ==========================================

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");
const logoutBtn = document.getElementById("logout-btn");

const authSection = document.getElementById("auth-section");
const userSection = document.getElementById("user-section");
const gameSection = document.getElementById("game-section");
const userEmail = document.getElementById("user-email");
const authMessage = document.getElementById("auth-message");

const gameMessage = document.getElementById("game-message");
const createGameBtn = document.getElementById("create-game-btn");
const joinGameBtn = document.getElementById("join-game-btn");
const gameCodeInput = document.getElementById("game-code");

const currentGame = document.getElementById("current-game");
const displayGameCode = document.getElementById("display-game-code");
const playerXName = document.getElementById("player-x-name");
const playerOName = document.getElementById("player-o-name");
const gameStatus = document.getElementById("game-status");
const gameBoard = document.getElementById("game-board");
const gameCells = Array.from(document.querySelectorAll(".cell"));
const rematchBtn = document.getElementById("rematch-btn");
const newGameBtn = document.getElementById("new-game-btn");
const historyList = document.getElementById("history-list");

// ==========================================
// CURRENT STATE
// ==========================================

let currentUser = null;
let currentGameData = null;
let realtimeChannel = null;
let waitingPollTimer = null;
let gamePollTimer = null;
let moveInProgress = false;
let rematchCreating = false;

// ==========================================
// SIGN UP
// ==========================================

signupBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        authMessage.textContent = "Enter email and password.";
        return;
    }

    const { error } = await supabaseClient.auth.signUp({
        email,
        password
    });

    if (error) {
        authMessage.textContent = error.message;
        return;
    }

    authMessage.textContent =
        "Account created. Check your email if confirmation is required.";
});

// ==========================================
// LOGIN
// ==========================================

loginBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        authMessage.textContent = "Enter email and password.";
        return;
    }

    const { data, error } =
        await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

    if (error) {
        authMessage.textContent = error.message;
        return;
    }

    authMessage.textContent = "Login successful.";
    await updateUI(data.user);
});

// ==========================================
// LOGOUT
// ==========================================

logoutBtn.addEventListener("click", async () => {
    stopWaitingForPlayerPolling();
    stopGamePolling();

    if (realtimeChannel) {
        await supabaseClient.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }

    await supabaseClient.auth.signOut();

    currentUser = null;
    currentGameData = null;

    updateUI(null);
});

// ==========================================
// STAGE 5: HISTORY / REMATCH
// ==========================================

if (rematchBtn) {
    rematchBtn.addEventListener("click", requestRematch);
}

if (newGameBtn) {
    newGameBtn.addEventListener("click", startNewGame);
}

async function loadGameHistory() {
    if (!currentUser || !historyList) return;

    historyList.innerHTML = "<p>Loading history...</p>";

    const { data, error } = await supabaseClient
        .from("games")
        .select("id, game_code, player_x, player_o, status, winner, board, created_at")
        .or(`player_x.eq.${currentUser.id},player_o.eq.${currentUser.id}`)
        .eq("status", "finished")
        .order("created_at", { ascending: false })
        .limit(30);

    if (error) {
        console.error("History error:", error);
        historyList.innerHTML = "<p>Could not load game history.</p>";
        return;
    }

    if (!data || data.length === 0) {
        historyList.innerHTML = "<p>No completed games yet.</p>";
        return;
    }

    const cards = [];
    for (const game of data) {
        const mySymbol = game.player_x === currentUser.id ? "X" : "O";
        const opponentId = mySymbol === "X" ? game.player_o : game.player_x;
        const opponent = await getPlayerName(opponentId);
        let result = "Draw";
        if (game.winner === mySymbol) result = "Won";
        else if (game.winner && game.winner !== "draw") result = "Lost";
        const date = game.created_at ? new Date(game.created_at).toLocaleString() : "";

        const card = document.createElement("div");
        card.className = "history-card";
        card.innerHTML = `
            <div><strong>Game ${game.game_code}</strong><span>${date}</span></div>
            <div>vs <strong>${escapeHtml(opponent)}</strong> · You: ${mySymbol}</div>
            <div class="history-result">${result}</div>`;
        cards.push(card);
    }

    historyList.replaceChildren(...cards);
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, ch => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[ch]));
}

async function requestRematch() {
    if (!currentUser || !currentGameData || currentGameData.status !== "finished") return;
    rematchBtn.disabled = true;
    const column = currentGameData.player_x === currentUser.id ? "rematch_x" : "rematch_o";
    const patch = {};
    patch[column] = true;

    const { error } = await supabaseClient
        .from("games")
        .update(patch)
        .eq("id", currentGameData.id);

    if (error) {
        console.error("Rematch request error:", error);
        gameMessage.textContent = "Could not request rematch: " + error.message;
        rematchBtn.disabled = false;
        return;
    }

    gameMessage.textContent = "Rematch requested. Waiting for the other player...";
    await refreshGame(currentGameData.id);
    rematchBtn.disabled = false;
    await maybeCreateRematch(currentGameData);
}

async function maybeCreateRematch(game) {
    if (rematchCreating || !game || game.status !== "finished") return;
    if (!game.rematch_x || !game.rematch_o) return;

    // Only Player X creates the new game, avoiding two games being created.
    if (!currentUser || game.player_x !== currentUser.id) {
        gameMessage.textContent = "Both players agreed. Player X is starting the rematch...";
        return;
    }

    rematchCreating = true;
    try {
        const gameCode = await generateUniqueGameCode();
        const { data, error } = await supabaseClient
            .from("games")
            .insert({
                game_code: gameCode,
                player_x: game.player_x,
                player_o: game.player_o,
                board: ["", "", "", "", "", "", "", "", ""],
                current_turn: "X",
                status: "playing",
                winner: null,
                rematch_x: false,
                rematch_o: false
            })
            .select()
            .single();

        if (error) throw error;

        await supabaseClient.from("games").update({ rematch_game_id: data.id }).eq("id", game.id);
        await showGame(data);
        subscribeToGame(data.id);
        startGamePolling(data.id);
        await loadGameHistory();
    } catch (error) {
        console.error("Rematch creation error:", error);
        gameMessage.textContent = "Could not start rematch: " + error.message;
    } finally {
        rematchCreating = false;
    }
}

async function startNewGame() {
    await createFreshGame();
}

async function createFreshGame() {
    if (!currentUser) return;
    createGameBtn.click();
}

// ==========================================
// AUTH STATE
// ==========================================

supabaseClient.auth.onAuthStateChange(
    async (event, session) => {
        const user = session ? session.user : null;
        await updateUI(user);
    }
);

// ==========================================
// UPDATE UI
// ==========================================

async function updateUI(user) {
    currentUser = user;

    if (user) {
        authSection.classList.add("hidden");
        userSection.classList.remove("hidden");
        gameSection.classList.remove("hidden");

        userEmail.textContent = user.email;

        await ensureProfile(user);
        await loadGameHistory();
    } else {
        authSection.classList.remove("hidden");
        userSection.classList.add("hidden");
        gameSection.classList.add("hidden");

        userEmail.textContent = "";
        resetGameUI();
    }
}

// ==========================================
// CREATE PROFILE IF NEEDED
// ==========================================

async function ensureProfile(user) {
    const usernameBase = user.email
        ? user.email.split("@")[0]
        : "player";

    const safeUsername = usernameBase
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .substring(0, 20);

    const username =
        safeUsername || `player_${user.id.substring(0, 8)}`;

    const { error } =
        await supabaseClient
            .from("profiles")
            .upsert(
                {
                    id: user.id,
                    username
                },
                {
                    onConflict: "id"
                }
            );

    if (error) {
        console.error("Profile error:", error);
    }
}

// ==========================================
// CREATE GAME
// ==========================================

createGameBtn.addEventListener("click", async () => {
    if (!currentUser) {
        gameMessage.textContent = "Please login first.";
        return;
    }

    createGameBtn.disabled = true;
    gameMessage.textContent = "Creating game...";

    try {
        const gameCode = await generateUniqueGameCode();

        const { data, error } =
            await supabaseClient
                .from("games")
                .insert({
                    game_code: gameCode,
                    player_x: currentUser.id,
                    player_o: null,
                    board: ["", "", "", "", "", "", "", ""],
                    current_turn: "X",
                    status: "waiting",
                    winner: null
                })
                .select()
                .single();

        if (error) {
            throw error;
        }

        currentGameData = data;
        await showGame(data);
        subscribeToGame(data.id);
        startWaitingForPlayerPolling(data.id);

    } catch (error) {
        console.error(error);
        gameMessage.textContent =
            "Could not create game: " + error.message;
    } finally {
        createGameBtn.disabled = false;
    }
});

// ==========================================
// GENERATE UNIQUE 6-DIGIT CODE
// ==========================================

async function generateUniqueGameCode() {
    for (let attempt = 0; attempt < 10; attempt++) {
        const code = Math.floor(
            100000 + Math.random() * 900000
        ).toString();

        const { data, error } =
            await supabaseClient
                .from("games")
                .select("id")
                .eq("game_code", code)
                .limit(1)
                .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data) {
            return code;
        }
    }

    throw new Error(
        "Could not generate a unique game code."
    );
}

// ==========================================
// JOIN GAME
// ==========================================

joinGameBtn.addEventListener("click", async () => {
    if (!currentUser) {
        gameMessage.textContent = "Please login first.";
        return;
    }

    const code = gameCodeInput.value.trim();

    if (!/^\d{6}$/.test(code)) {
        gameMessage.textContent =
            "Enter a valid 6-digit game code.";
        return;
    }

    joinGameBtn.disabled = true;
    gameMessage.textContent = "Finding game...";

    try {
        const { data: game, error: findError } =
            await supabaseClient
                .from("games")
                .select("*")
                .eq("game_code", code)
                .limit(1)
                .maybeSingle();

        if (findError) {
            throw findError;
        }

        if (!game) {
            gameMessage.textContent = "Game not found.";
            return;
        }

        if (game.player_x === currentUser.id) {
            gameMessage.textContent =
                "You created this game.";

            await showGame(game);
            subscribeToGame(game.id);
            startGamePolling(game.id);
            return;
        }

        if (game.player_o) {
            gameMessage.textContent =
                "This game already has two players.";
            return;
        }

        const { error: updateError } =
            await supabaseClient
                .from("games")
                .update({
                    player_o: currentUser.id,
                    status: "playing"
                })
                .eq("id", game.id)
                .is("player_o", null)
                .eq("status", "waiting");

        if (updateError) {
            throw updateError;
        }

        const { data: updatedGame, error: fetchError } =
            await supabaseClient
                .from("games")
                .select("*")
                .eq("id", game.id)
                .maybeSingle();

        if (fetchError) {
            throw fetchError;
        }

        if (!updatedGame) {
            throw new Error(
                "Game was updated but could not be loaded."
            );
        }

        currentGameData = updatedGame;

        await showGame(updatedGame);
        subscribeToGame(updatedGame.id);
        startGamePolling(updatedGame.id);

    } catch (error) {
        console.error("Join game error:", error);

        gameMessage.textContent =
            "Could not join game: " + error.message;
    } finally {
        joinGameBtn.disabled = false;
    }
});

// ==========================================
// SHOW GAME
// ==========================================

async function showGame(game) {
    // When Player X creates the rematch, Player O learns the new game
    // through the old game's update and automatically switches to it.
    if (game.rematch_game_id && currentUser && game.player_o === currentUser.id && game.id !== game.rematch_game_id) {
        const { data: rematchGame, error } = await supabaseClient
            .from("games")
            .select("*")
            .eq("id", game.rematch_game_id)
            .maybeSingle();

        if (!error && rematchGame) {
            currentGameData = rematchGame;
            await showGame(rematchGame);
            subscribeToGame(rematchGame.id);
            startGamePolling(rematchGame.id);
            return;
        }
    }

    currentGameData = game;

    currentGame.classList.remove("hidden");
    displayGameCode.textContent = game.game_code;

    playerXName.textContent = await getPlayerName(game.player_x);
    playerOName.textContent = game.player_o
        ? await getPlayerName(game.player_o)
        : "Waiting...";

    renderBoard(game);

    if (game.status === "waiting") {
        gameStatus.textContent = "Waiting for Player 2...";
        gameBoard.classList.add("hidden");
        startWaitingForPlayerPolling(game.id);
        stopGamePolling();
        return;
    }

    stopWaitingForPlayerPolling();
    gameBoard.classList.remove("hidden");
    startGamePolling(game.id);

    if (game.status === "finished") {
        if (game.winner === "draw") {
            gameStatus.textContent = "Draw game!";
        } else {
            gameStatus.textContent = `Player ${game.winner} wins!`;
        }
        setBoardEnabled(false);
        if (rematchBtn) {
            rematchBtn.classList.remove("hidden");
            const myFlag = game.player_x === currentUser?.id ? game.rematch_x : game.rematch_o;
            const otherFlag = game.player_x === currentUser?.id ? game.rematch_o : game.rematch_x;
            rematchBtn.textContent = myFlag ? (otherFlag ? "Starting rematch..." : "Rematch requested") : "Request Rematch";
            rematchBtn.disabled = Boolean(myFlag);
        }
        if (newGameBtn) newGameBtn.classList.remove("hidden");
        await maybeCreateRematch(game);
        await loadGameHistory();
        return;
    }

    if (rematchBtn) rematchBtn.classList.add("hidden");
    if (newGameBtn) newGameBtn.classList.add("hidden");

    const mySymbol = getMySymbol(game);
    if (mySymbol && game.current_turn === mySymbol) {
        gameStatus.textContent = `Your turn (${mySymbol})`;
        setBoardEnabled(true);
    } else if (game.current_turn) {
        gameStatus.textContent = `Player ${game.current_turn}'s turn`;
        setBoardEnabled(false);
    }
}

function getMySymbol(game) {
    if (!currentUser || !game) return null;
    if (game.player_x === currentUser.id) return "X";
    if (game.player_o === currentUser.id) return "O";
    return null;
}

function normalizeBoard(board) {
    return Array.isArray(board) && board.length === 9
        ? board.map(value => value || "")
        : ["", "", "", "", "", "", "", "", ""];
}

function renderBoard(game) {
    const board = normalizeBoard(game.board);
    gameCells.forEach((cell, index) => {
        const value = board[index];
        cell.textContent = value;
        cell.classList.toggle("x", value === "X");
        cell.classList.toggle("o", value === "O");
        cell.classList.remove("winner");
    });

    if (game.status === "finished") {
        const winningLine = getWinningLine(board, game.winner);
        winningLine.forEach(index => gameCells[index].classList.add("winner"));
    }
}

function setBoardEnabled(enabled) {
    gameCells.forEach(cell => {
        const index = Number(cell.dataset.index);
        const board = normalizeBoard(currentGameData?.board);
        cell.disabled = !enabled || Boolean(board[index]);
    });
}

function getWinningLine(board, winner) {
    if (!winner || winner === "draw") return [];
    const lines = [
        [0,1,2], [3,4,5], [6,7,8],
        [0,3,6], [1,4,7], [2,5,8],
        [0,4,8], [2,4,6]
    ];
    return lines.find(line => line.every(index => board[index] === winner)) || [];
}

function getWinner(board) {
    const lines = [
        [0,1,2], [3,4,5], [6,7,8],
        [0,3,6], [1,4,7], [2,5,8],
        [0,4,8], [2,4,6]
    ];
    for (const [a,b,c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    return board.every(Boolean) ? "draw" : null;
}

async function playMove(index) {
    if (moveInProgress) return;
    if (!currentUser || !currentGameData) return;
    const game = currentGameData;
    if (game.status !== "playing") return;

    const mySymbol = getMySymbol(game);
    if (!mySymbol || game.current_turn !== mySymbol) return;

    const board = normalizeBoard(game.board);
    if (board[index]) return;

    moveInProgress = true;
    board[index] = mySymbol;
    const result = getWinner(board);
    const nextTurn = result ? game.current_turn : (mySymbol === "X" ? "O" : "X");
    const newStatus = result ? "finished" : "playing";
    const newWinner = result || null;

    // Show the move immediately on this device.
    const optimisticGame = {
        ...game,
        board,
        current_turn: nextTurn,
        status: newStatus,
        winner: newWinner
    };

    currentGameData = optimisticGame;
    renderBoard(optimisticGame);
    gameCells.forEach(cell => cell.disabled = true);
    gameStatus.textContent = "Saving move...";

    // Do not use .select() here. UPDATE + SELECT can be rejected by
    // SELECT RLS even when the UPDATE itself is allowed.
    const { error } = await supabaseClient
        .from("games")
        .update({
            board,
            current_turn: nextTurn,
            status: newStatus,
            winner: newWinner
        })
        .eq("id", game.id)
        .eq("status", "playing")
        .eq("current_turn", mySymbol);

    if (error) {
        console.error("Move error:", error);
        gameStatus.textContent = "Could not save move: " + error.message;
        await refreshGame(game.id);
        moveInProgress = false;
        return;
    }

    // Load the authoritative database state after saving.
    await refreshGame(game.id);
    moveInProgress = false;
}

gameCells.forEach(cell => {
    cell.addEventListener("click", () => {
        const index = Number(cell.dataset.index);
        console.log("Cell clicked:", index, {
            game: currentGameData?.id,
            status: currentGameData?.status,
            turn: currentGameData?.current_turn,
            mySymbol: getMySymbol(currentGameData)
        });
        playMove(index);
    });
});

async function refreshGame(gameId) {
    const { data, error } = await supabaseClient
        .from("games")
        .select("*")
        .eq("id", gameId)
        .maybeSingle();

    if (!error && data) {
        await showGame(data);
    }
}

// ==========================================
// GET PLAYER NAME
// ==========================================

async function getPlayerName(userId) {
    if (!userId) {
        return "Waiting...";
    }

    const { data, error } =
        await supabaseClient
            .from("profiles")
            .select("username")
            .eq("id", userId)
            .maybeSingle();

    if (error || !data) {
        return "Player";
    }

    return data.username;
}

// ==========================================
// WAITING FOR PLAYER 2 POLLING
// ==========================================

function startWaitingForPlayerPolling(gameId) {
    if (waitingPollTimer) {
        return;
    }

    const checkGame = async () => {
        try {
            const { data, error } =
                await supabaseClient
                    .from("games")
                    .select("*")
                    .eq("id", gameId)
                    .maybeSingle();

            if (error) {
                console.error("Waiting poll error:", error);
                return;
            }

            if (!data) {
                return;
            }

            currentGameData = data;

            if (data.status !== "waiting" || data.player_o) {
                await showGame(data);

                // Re-subscribe in case the original Realtime channel
                // was not connected.
                subscribeToGame(data.id);
            }
        } catch (error) {
            console.error("Waiting poll exception:", error);
        }
    };

    // Check immediately, then every second.
    checkGame();
    waitingPollTimer = setInterval(checkGame, 1000);
}

function stopWaitingForPlayerPolling() {
    if (waitingPollTimer) {
        clearInterval(waitingPollTimer);
        waitingPollTimer = null;
    }
}

// ==========================================
// ACTIVE GAME POLLING
// ==========================================

function startGamePolling(gameId) {
    if (gamePollTimer) return;

    const checkGame = async () => {
        if (!currentGameData || currentGameData.id !== gameId) return;
        if (moveInProgress) return;
        if (currentGameData.status === "finished") {
            stopGamePolling();
            return;
        }
        await refreshGame(gameId);
    };

    checkGame();
    gamePollTimer = setInterval(checkGame, 1000);
}

function stopGamePolling() {
    if (gamePollTimer) {
        clearInterval(gamePollTimer);
        gamePollTimer = null;
    }
}

// ==========================================
// REALTIME GAME UPDATES
// ==========================================

function subscribeToGame(gameId) {
    if (realtimeChannel) {
        supabaseClient.removeChannel(realtimeChannel);
    }

    realtimeChannel =
        supabaseClient
            .channel(`game-${gameId}`)
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "games",
                    filter: `id=eq.${gameId}`
                },
                async (payload) => {
                    console.log(
                        "Game updated:",
                        payload.new
                    );

                    if (!moveInProgress) {
                        await showGame(payload.new);
                    }
                }
            )
            .subscribe((status) => {
                console.log(
                    "Realtime status:",
                    status
                );
            });
}

// ==========================================
// RESET GAME UI
// ==========================================

function resetGameUI() {
    stopWaitingForPlayerPolling();
    stopGamePolling();
    currentGameData = null;

    currentGame.classList.add("hidden");
    gameBoard.classList.add("hidden");

    displayGameCode.textContent = "------";
    playerXName.textContent = "Waiting...";
    playerOName.textContent = "Waiting...";
    gameStatus.textContent = "Waiting for Player 2...";
    gameMessage.textContent = "Create or join a game.";

    if (rematchBtn) rematchBtn.classList.add("hidden");
    if (newGameBtn) newGameBtn.classList.add("hidden");
    if (historyList) historyList.innerHTML = "";

    gameCodeInput.value = "";
}
