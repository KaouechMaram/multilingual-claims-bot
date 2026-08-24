// script.js — logique d'authentification côté client
//
// Le token JWT n'est plus manipulé en JavaScript : il vit dans un cookie
// httpOnly posé par le serveur (voir backend/server.js), donc invisible et
// inaccessible depuis ce script. Cela protège contre le vol de session en
// cas de faille XSS. Le navigateur envoie automatiquement ce cookie à
// chaque requête vers l'API grâce à `credentials: "include"`.

const form = document.getElementById("login-form");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const toggleBtn = document.getElementById("toggle-password");
const submitBtn = document.getElementById("submit-btn");
const submitLabel = document.getElementById("submit-label");
const messageBox = document.getElementById("form-message");
const ssoBtn = document.getElementById("sso-btn");
const forgotLink = document.getElementById("forgot-link");

// Afficher / masquer le mot de passe
toggleBtn.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  toggleBtn.textContent = isPassword ? "🙈" : "👁️";
});

function showMessage(text, type) {
  messageBox.textContent = text;
  messageBox.className = "form-message " + (type || "");
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitLabel.textContent = isLoading ? "Connexion en cours…" : "Se connecter";
}

// Si une session est déjà active (cookie valide), on le signale et on
// redirige directement vers le chat plutôt que de réafficher le formulaire.
async function checkExistingSession() {
  try {
    const res = await fetch(`${window.API_BASE_URL}/auth/me`, {
      credentials: "include",
    });
    const data = await res.json();
    if (data.success) {
      showMessage(`Déjà connecté en tant que ${data.user.fullName}. Redirection…`, "success");
      setTimeout(() => {
        window.location.href = "chat.html";
      }, 600);
    }
  } catch (err) {
    // Backend indisponible : on ignore silencieusement, l'utilisateur peut
    // simplement se reconnecter.
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage("", "");

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    showMessage("Merci de renseigner votre nom d'utilisateur et votre mot de passe.", "error");
    return;
  }

  setLoading(true);

  try {
    const res = await fetch(`${window.API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // necessaire pour que le navigateur accepte/stocke le cookie httpOnly
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      showMessage(data.message || "Échec de la connexion.", "error");
      setLoading(false);
      return;
    }

    // Le cookie de session est déjà posé par le serveur à ce stade. On garde
    // juste le profil utilisateur (non sensible) pour un affichage immédiat
    // dans l'interface de chat, en attendant la vérification via /auth/me.
    sessionStorage.setItem("stb_user", JSON.stringify(data.user));

    showMessage("Connexion réussie. Redirection…", "success");

    setTimeout(() => {
      window.location.href = "chat.html";
    }, 800);

  } catch (err) {
    showMessage(
      "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.",
      "error"
    );
  } finally {
    setLoading(false);
  }
});

if (ssoBtn) {
  ssoBtn.addEventListener("click", async () => {
    showMessage("", "");
    try {
      const res = await fetch(`${window.API_BASE_URL}/auth/sso/start`);
      const data = await res.json();
      showMessage(data.message, data.success ? "success" : "error");
    } catch (err) {
      showMessage("Le service SSO est momentanément indisponible.", "error");
    }
  });
}

forgotLink.addEventListener("click", (e) => {
  e.preventDefault();
  showMessage("Contactez votre administrateur ou le support STB pour réinitialiser votre mot de passe.", "");
});

checkExistingSession();
