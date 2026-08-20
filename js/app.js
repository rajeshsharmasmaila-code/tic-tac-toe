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


// ==========================================
// SIGN UP
// ==========================================

signupBtn.addEventListener("click", async () => {

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        authMessage.textContent =
            "Enter email and password.";

        return;
    }

    const { data, error } =
        await supabaseClient.auth.signUp({
            email,
            password
        });

    if (error) {

        authMessage.textContent =
            error.message;

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
        authMessage.textContent =
            "Enter email and password.";

        return;
    }

    const { data, error } =
        await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

    if (error) {

        authMessage.textContent =
            error.message;

        return;
    }

    authMessage.textContent =
        "Login successful.";

    updateUI(data.user);
});


// ==========================================
// LOGOUT
// ==========================================

logoutBtn.addEventListener("click", async () => {

    await supabaseClient.auth.signOut();

    updateUI(null);
});


// ==========================================
// AUTH STATE
// ==========================================

supabaseClient.auth.onAuthStateChange(
    (event, session) => {

        updateUI(
            session ? session.user : null
        );
    }
);


// ==========================================
// UPDATE UI
// ==========================================

function updateUI(user) {

    if (user) {

        authSection.classList.add("hidden");

        userSection.classList.remove("hidden");
        gameSection.classList.remove("hidden");

        userEmail.textContent =
            user.email;

    } else {

        authSection.classList.remove("hidden");

        userSection.classList.add("hidden");
        gameSection.classList.add("hidden");

        userEmail.textContent = "";
    }
      }
