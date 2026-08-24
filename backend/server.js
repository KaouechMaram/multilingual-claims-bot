// server.js
// Backend d'authentification - Chatbot Réclamations Monétique (STB Bank)
//
// Démarrage :
//   1) cp .env.example .env   (puis modifiez JWT_SECRET et INTERNAL_API_KEY)
//   2) npm install
//   3) npm start

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const { findByUsername, findById, updateUser } = require("./users");
const { requireAuth, requireRole } = require("./authMiddleware");
const { appellerChatbotRepondre, appellerChatbotTranscrire, proxyParler } = require("./chatbotProxy");
const { auditLog } = require("./auditLog");
const reclamations = require("./reclamations");
const { enregistrerFeedback } = require("./feedback");
const { notifierChangementStatut } = require("./notificationService");
const { uploadJustificatif, UPLOAD_DIR, verifierSignatureFichier } = require("./uploadMiddleware");

const app = express();
const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || "development";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";
const LOCK_AFTER_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const COOKIE_NAME = "stb_token";

// ---------- Garde-fous de configuration ----------
const DEFAULT_SECRETS = ["dev-secret-change-me", "changez-moi-avec-une-longue-chaine-aleatoire"];
if (DEFAULT_SECRETS.includes(JWT_SECRET) || !process.env.INTERNAL_API_KEY) {
  const message =
    "⚠️  JWT_SECRET et/ou INTERNAL_API_KEY utilisent une valeur par défaut ou sont absents.\n" +
    "   Generez de vraies valeurs aleatoires avant toute mise en ligne :\n" +
    "   node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"";
  if (NODE_ENV === "production") {
    console.error("❌ " + message);
    console.error("   Démarrage refusé (NODE_ENV=production).");
    process.exit(1);
  } else {
    console.warn(message);
  }
}

// ---------- Middlewares de securite ----------

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(express.json({ limit: "12mb" }));
app.use(cookieParser());
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  })
);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Trop de tentatives. Merci de réessayer dans quelques minutes." },
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Trop de messages envoyés. Merci de patienter quelques instants." },
});

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  });
}

// ---------- Routes : sante / auth ----------

app.get("/api/health", (req, res) => {
  res.json({ success: true, service: "stb-chatbot-auth", status: "ok" });
});

app.post("/api/auth/login", loginLimiter, (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Nom d'utilisateur et mot de passe requis." });
  }

  const user = findByUsername(username);
  const genericError = { success: false, message: "Nom d'utilisateur ou mot de passe incorrect." };

  if (!user) {
    auditLog("login_failed", { username, reason: "unknown_user", ip: req.ip });
    return res.status(401).json(genericError);
  }

  if (user.lockedUntil && Date.now() < user.lockedUntil) {
    const minutesLeft = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    auditLog("login_blocked_locked", { username, ip: req.ip });
    return res.status(423).json({
      success: false,
      message: `Compte temporairement verrouillé. Réessayez dans ${minutesLeft} min.`,
    });
  }

  const isValid = bcrypt.compareSync(password, user.passwordHash);

  if (!isValid) {
    const failedAttempts = (user.failedAttempts || 0) + 1;
    const patch = { failedAttempts };
    if (failedAttempts >= LOCK_AFTER_ATTEMPTS) {
      patch.lockedUntil = Date.now() + LOCK_DURATION_MS;
      patch.failedAttempts = 0;
      auditLog("account_locked", { username, ip: req.ip });
    }
    updateUser(user.id, patch);
    auditLog("login_failed", { username, reason: "bad_password", ip: req.ip, failedAttempts });
    return res.status(401).json(genericError);
  }

  updateUser(user.id, { failedAttempts: 0, lockedUntil: null });
  auditLog("login_success", { username, ip: req.ip });

  const token = jwt.sign(
    { sub: user.id, username: user.username, fullName: user.fullName, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  setAuthCookie(res, token);

  return res.json({
    success: true,
    message: "Connexion réussie.",
    user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
  });
});

app.get("/api/auth/sso/start", (req, res) => {
  res.json({
    success: false,
    message: "L'authentification SSO n'est pas encore configurée. Contactez l'équipe IT.",
  });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ success: true, message: "Déconnexion réussie." });
});

// =====================================================================
// Chatbot : conversation + persistance (ticket, messages, escalade)
// =====================================================================

app.post("/api/chat/repondre", chatLimiter, requireAuth, async (req, res) => {
  const { texte, contexte_precedent } = req.body || {};

  if (!texte || !String(texte).trim()) {
    return res.status(400).json({ success: false, message: "Message vide." });
  }
  if (String(texte).length > 2000) {
    return res.status(400).json({ success: false, message: "Message trop long (2000 caractères max)." });
  }

  let data;
  try {
    data = await appellerChatbotRepondre(texte, contexte_precedent);
  } catch (err) {
    return res.status(err.status || 502).json({
      success: false,
      message: err.message || "Le service chatbot n'a pas pu répondre.",
    });
  }

  // Persistance : ticket (reclamation) + messages user/bot. Une reclamation
  // n'est creee que si la sous-categorie represente un vrai probleme (pas
  // une simple salutation) OU qu'une escalade humaine est en jeu (mode
  // degrade, demande explicite de conseiller).
  const ticket = reclamations.creerOuMettreAJourReclamation({
    user_id: req.user.sub,
    sous_categorie: data.sous_categorie,
    resume: data.resume_precis && data.resume_precis.trim() ? data.resume_precis : texte,
    escalade_humaine: !!data.escalade_humaine,
  });

  reclamations.ajouterMessage({
    reclamation_id: ticket ? ticket.id : null,
    user_id: req.user.sub,
    role: "user",
    texte,
    sous_categorie: data.sous_categorie,
    degrade: false,
  });

  const messageBot = reclamations.ajouterMessage({
    reclamation_id: ticket ? ticket.id : null,
    user_id: req.user.sub,
    role: "bot",
    texte: data.reponse,
    sous_categorie: data.sous_categorie,
    degrade: !!data.degrade,
  });

  if (data.degrade) {
    auditLog("chatbot_degrade", { username: req.user.username, ticket_id: ticket && ticket.id });
  }

  return res.json({
    success: true,
    reponse: data.reponse,
    sous_categorie: data.sous_categorie,
    est_salutation: !!data.est_salutation,
    escalade_humaine: !!data.escalade_humaine,
    degrade: !!data.degrade,
    reclamation_id: ticket ? ticket.id : null,
    message_id: messageBot.id,
  });
});

app.post("/api/chat/transcrire", chatLimiter, requireAuth, async (req, res) => {
  const { audio_base64, nom_fichier } = req.body || {};

  if (!audio_base64) {
    return res.status(400).json({ success: false, message: "Audio manquant." });
  }
  if (audio_base64.length > 14_000_000) {
    return res.status(400).json({ success: false, message: "Fichier audio trop volumineux." });
  }

  try {
    const data = await appellerChatbotTranscrire(audio_base64, nom_fichier);
    return res.json({ success: true, texte: data.texte });
  } catch (err) {
    return res.status(err.status || 502).json({
      success: false,
      message: err.message || "Transcription impossible.",
    });
  }
});

app.post("/api/chat/parler", chatLimiter, requireAuth, proxyParler);

// Retour utilisateur (pouce leve/baisse) sur une reponse du bot
app.post("/api/chat/feedback", requireAuth, (req, res) => {
  const { message_id, rating } = req.body || {};
  if (!message_id || (rating !== 1 && rating !== -1)) {
    return res.status(400).json({ success: false, message: "message_id et rating (1 ou -1) requis." });
  }
  try {
    enregistrerFeedback({ message_id, user_id: req.user.sub, rating });
    return res.json({ success: true });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// =====================================================================
// Réclamations (tickets) — vue utilisateur
// =====================================================================

app.get("/api/reclamations", requireAuth, (req, res) => {
  const liste = reclamations.listerParUtilisateur(req.user.sub);
  res.json({ success: true, data: liste });
});

app.get("/api/reclamations/:id", requireAuth, (req, res) => {
  const ticket = reclamations.obtenirAvecMessages(Number(req.params.id), req.user.sub);
  if (!ticket) {
    return res.status(404).json({ success: false, message: "Réclamation introuvable." });
  }
  res.json({ success: true, data: ticket });
});

// Upload d'un justificatif (photo/PDF) joint à une réclamation existante,
// appartenant obligatoirement à l'utilisateur connecté.
app.post(
  "/api/reclamations/:id/justificatif",
  requireAuth,
  (req, res, next) => {
    // Multer signale les erreurs (type de fichier refusé, taille depassee)
    // via un callback plutot qu'une exception classique : sans ce wrapper,
    // Express retombe sur sa page d'erreur par defaut, qui expose la pile
    // d'appels complete (chemins sur le serveur, dependances internes) au
    // client. On l'intercepte ici pour renvoyer une reponse JSON propre.
    uploadJustificatif.single("fichier")(req, res, (err) => {
      if (err) {
        const message =
          err.code === "LIMIT_FILE_SIZE"
            ? "Fichier trop volumineux (8 Mo maximum)."
            : err.message || "Fichier invalide.";
        return res.status(400).json({ success: false, message });
      }
      next();
    });
  },
  verifierSignatureFichier,
  (req, res) => {
    const id = Number(req.params.id);
    const ticket = reclamations.obtenirAvecMessages(id, req.user.sub);
    if (!ticket) {
      // Le fichier a deja ete ecrit sur disque a ce stade (Multer agit avant
      // ce handler) : on le supprime pour ne rien laisser d'orphelin.
      if (req.file) fs.unlinkSync(path.join(req.file.destination, req.file.filename));
      return res.status(404).json({ success: false, message: "Réclamation introuvable." });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Aucun fichier reçu." });
    }
    const cheminRelatif = path.join(String(req.user.sub), req.file.filename);
    reclamations.attacherJustificatif(id, cheminRelatif);
    res.json({ success: true, message: "Justificatif ajouté." });
  }
);

// Sert le justificatif d'une réclamation — uniquement à son propriétaire
// ou à un superviseur (role admin).
app.get("/api/reclamations/:id/justificatif", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const ticket =
    req.user.role === "admin"
      ? reclamations.listerToutes().find((r) => r.id === id)
      : reclamations.obtenirAvecMessages(id, req.user.sub);

  if (!ticket || !ticket.justificatif_path) {
    return res.status(404).json({ success: false, message: "Justificatif introuvable." });
  }

  const cheminAbsolu = path.join(UPLOAD_DIR, ticket.justificatif_path);
  if (!cheminAbsolu.startsWith(UPLOAD_DIR) || !fs.existsSync(cheminAbsolu)) {
    return res.status(404).json({ success: false, message: "Fichier introuvable." });
  }
  res.sendFile(cheminAbsolu);
});

// =====================================================================
// Espace superviseur (role "admin") — tableau de bord, file d'escalade
// =====================================================================

app.get("/api/agent/reclamations", requireAuth, requireRole("admin"), (req, res) => {
  const { statut } = req.query;
  res.json({ success: true, data: reclamations.listerToutes({ statut }) });
});

app.patch("/api/agent/reclamations/:id/statut", requireAuth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const { statut } = req.body || {};
  try {
    const ticket = reclamations.mettreAJourStatut(id, statut);
    const client = findById(ticket.user_id);
    if (client) {
      await notifierChangementStatut({
        reclamation_id: ticket.id,
        destinataire: client.email || `${client.username}@stb-demo.local`,
        canal: "email",
        statut: ticket.statut,
        sous_categorie: ticket.sous_categorie,
      });
    }
    res.json({ success: true, data: ticket });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.post(
  "/api/agent/reclamations/:id/escalade-traitee",
  requireAuth,
  requireRole("admin"),
  (req, res) => {
    const ticket = reclamations.marquerEscaladeTraitee(Number(req.params.id));
    res.json({ success: true, data: ticket });
  }
);

app.get("/api/agent/stats", requireAuth, requireRole("admin"), (req, res) => {
  res.json({
    success: true,
    data: {
      parCategorie: reclamations.statsParCategorie(),
      parStatut: reclamations.statsParStatut(),
    },
  });
});

// File d'attente des demandes d'escalade humaine, en temps reel via
// Server-Sent Events : le tableau de bord agent reste a jour sans
// rafraichissement manuel, sans la complexite d'un vrai serveur websocket.
app.get("/api/agent/escalades/stream", requireAuth, requireRole("admin"), (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  let dernierEtat = "";
  const envoyerSiChange = () => {
    const liste = reclamations.listerEscaladesEnAttente();
    const etat = JSON.stringify(liste.map((r) => [r.id, r.updated_at, r.escalade_traitee]));
    if (etat !== dernierEtat) {
      dernierEtat = etat;
      res.write(`data: ${JSON.stringify(liste)}\n\n`);
    }
  };

  envoyerSiChange(); // etat initial immediat
  const intervalle = setInterval(envoyerSiChange, 3000);

  req.on("close", () => {
    clearInterval(intervalle);
  });
});

// ---------- Gestion d'erreurs generique ----------
// Filet de securite : toute erreur non interceptee plus haut est renvoyee
// en JSON, sans jamais exposer la pile d'appels (chemins serveur, details
// d'implementation) au client. En developpement, le detail reste visible
// dans les logs serveur (console.error) pour faciliter le debogage.
app.use((err, req, res, next) => {
  console.error("Erreur non gerée :", err);
  if (res.headersSent) return next(err);
  res.status(500).json({
    success: false,
    message: "Une erreur inattendue est survenue. Merci de réessayer.",
  });
});

app.listen(PORT, () => {
  console.log(`✅ API d'authentification démarrée sur http://localhost:${PORT}`);
  console.log(`   Compte de démo (agent) : demo / Demo1234!`);
  console.log(`   Compte de démo (superviseur) : admin / Admin1234!`);
});
