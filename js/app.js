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

// ==========================================
// CURRENT STATE
// ==========================================

let currentUser = null;
let currentGameData = null;
let realtimeChannel = null;

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
        const { data: game, error } =
            await supabaseClient
                .from("games")
                .select("*")
                .eq("game_code", code)
                .maybeSingle();

        if (error) {
            throw error;
        }

        if (!game) {
            gameMessage.textContent = "Game not found.";
            return;
        }

        if (game.player_o) {
            gameMessage.textContent =
                "This game already has two players.";
            return;
        }

        if (game.player_x === currentUser.id) {
            gameMessage.textContent =
                "You created this game.";

            await showGame(game);
            subscribeToGame(game.id);
            return;
        }

        const { data: updatedGame, error: updateError } =
            await supabaseClient
                .from("games")
                .update({
                    player_o: currentUser.id,
                    status: "playing"
                })
                .eq("id", game.id)
                .is("player_o", null)
                .eq("status", "waiting")
                .select()
                .single();

        if (updateError) {
            throw updateError;
        }

        currentGameData = updatedGame;

        await showGame(updatedGame);
        subscribeToGame(updatedGame.id);

    } catch (error) {
        console.error(error);
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
    currentGameData = game;

    currentGame.classList.remove("hidden");

    displayGameCode.textContent = game.game_code;

    playerXName.textContent =
        await getPlayerName(game.player_x);

    playerOName.textContent =
        game.player_o
            ? await getPlayerName(game.player_o)
            : "Waiting...";

    if (game.status === "waiting") {
        gameStatus.textContent =
            "Waiting for Player 2...";
        gameBoard.classList.add("hidden");
    } else {
        gameStatus.textContent =
            "Game ready!";
        gameBoard.classList.remove("hidden");
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

                    await showGame(payload.new);
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
    currentGameData = null;

    currentGame.classList.add("hidden");
    gameBoard.classList.add("hidden");

    displayGameCode.textContent = "------";
    playerXName.textContent = "Waiting...";
    playerOName.textContent = "Waiting...";
    gameStatus.textContent = "Waiting for Player 2...";
    gameMessage.textContent = "Create or join a game.";

    gameCodeInput.value = "";
}
