// chat.js — logique du chatbot cote client
// L'authentification repose sur un cookie httpOnly pose par le serveur a la
// connexion (voir backend/server.js) : ce script ne lit ni ne stocke jamais
// le token JWT lui-meme (inaccessible en JS, protection contre le vol par
// XSS). Chaque requete inclut `credentials: "include"` pour que le
// navigateur transmette automatiquement ce cookie. Toutes les requetes
// passent par le backend Node (jamais directement vers le microservice
// Python).

const USER_KEY = "stb_user";

const messagesEl = document.getElementById("messages");
const typingRowEl = document.getElementById("typing-indicator");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("chat-input");
const errorEl = document.getElementById("chat-error");
const userNameEl = document.getElementById("user-name");
const logoutBtn = document.getElementById("logout-btn");
const micBtn = document.getElementById("mic-btn");
const attachBtn = document.getElementById("attach-btn");
const attachInput = document.getElementById("attach-input");
const attachPreviewEl = document.getElementById("attachment-preview");
const voiceCaptionEl = document.getElementById("voice-caption");
const ttsAudio = document.getElementById("tts-audio");
const viewTitleEl = document.getElementById("view-title");
const navDashboardBtn = document.getElementById("nav-dashboard");

const ICON_BOT =
  '<svg viewBox="0 0 24 24" width="16" height="16" style="width:16px;height:16px" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/><circle cx="9" cy="13" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="13" r="1.2" fill="currentColor" stroke="none"/></svg>';
const ICON_USER =
  '<svg viewBox="0 0 24 24" width="16" height="16" style="width:16px;height:16px" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const ICON_CHECK =
  '<svg viewBox="0 0 24 24" width="12" height="12" style="width:12px;height:12px" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const ICON_WARNING =
  '<svg viewBox="0 0 24 24" width="16" height="16" style="width:16px;height:16px" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
const ICON_THUMB_UP =
  '<svg viewBox="0 0 24 24" width="14" height="14" style="width:14px;height:14px" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 22V11m0 11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3m3 11h6.5a2 2 0 0 0 2-1.63l1.34-7A2 2 0 0 0 18 9H14V4a2 2 0 0 0-2-2l-3 7v13z"/></svg>';
const ICON_THUMB_DOWN =
  '<svg viewBox="0 0 24 24" width="14" height="14" style="width:14px;height:14px" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2v11m0-11h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3m-3-11H7.5a2 2 0 0 0-2 1.63l-1.34 7A2 2 0 0 0 6 22h4v-5a2 2 0 0 0 2 2l3-7V2z"/></svg>';
const ICON_PAPERCLIP =
  '<svg viewBox="0 0 24 24" width="15" height="15" style="width:15px;height:15px;flex-shrink:0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';

const QUICK_REPLIES = [
  { label: "💳 Carte", texte: "J'ai un problème avec ma carte bancaire." },
  { label: "💰 Paiement", texte: "J'ai un problème avec un paiement." },
  { label: "🏧 Distributeur (DAB)", texte: "J'ai un problème avec un distributeur automatique." },
  { label: "📱 Application", texte: "J'ai un problème avec l'application STB." },
];

let derniereCategorie = null; // memoire de conversation (contexte_precedent)
let dernierReclamationId = null; // dernier ticket connu, pour rattacher un justificatif sans repasser par la classification
let mediaRecorder = null;
let audioChunks = [];
let enregistrement = false;
let utilisateurCourant = null;
let fichierEnAttente = null; // justificatif choisi mais pas encore envoye
let reconnaissanceVocale = null;
let sseEscalades = null;

function goToLogin() {
  sessionStorage.removeItem(USER_KEY);
  window.location.href = "index.html";
}

// ---------- Garde d'authentification ----------
async function verifierSession() {
  try {
    const res = await fetch(`${window.API_BASE_URL}/auth/me`, {
      credentials: "include",
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      goToLogin();
      return;
    }

    utilisateurCourant = data.user;
    userNameEl.textContent = data.user.fullName || data.user.username;

    if (data.user.role === "admin") {
      navDashboardBtn.classList.remove("hidden");
    }

    demarrerNouvelleConversation();
  } catch (err) {
    showError("Impossible de contacter le serveur d'authentification.");
  }
}

// ---------- Accueil / hero ----------

function demarrerNouvelleConversation() {
  messagesEl.innerHTML = "";
  derniereCategorie = null;
  dernierReclamationId = null;
  showError("");
  effacerPieceJointe();

  const hero = document.createElement("div");
  hero.className = "chat-hero";
  hero.innerHTML = `
    <div class="chat-hero-text">
      <h2>Bonjour ! 👋</h2>
      <p>Je suis votre assistant virtuel STB.</p>
      <p>Je peux vous aider pour vos réclamations monétiques (cartes, paiements, distributeurs, applications...).</p>
      <div class="quick-replies" role="group" aria-label="Suggestions de sujets"></div>
    </div>
    <div class="chat-hero-img">
      <img src="assets/brand-panel.png" alt="Assistant virtuel STB Bank" />
    </div>
  `;
  messagesEl.appendChild(hero);

  const quickRepliesEl = hero.querySelector(".quick-replies");
  QUICK_REPLIES.forEach((qr) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quick-reply-btn";
    btn.textContent = qr.label;
    btn.addEventListener("click", () => {
      quickRepliesEl.querySelectorAll("button").forEach((b) => (b.disabled = true));
      envoyerMessage(qr.texte);
    });
    quickRepliesEl.appendChild(btn);
  });

  ajouterMessage(
    "bot",
    "Bonjour et bienvenue au service réclamations monétique de la STB. " +
      "Décrivez-moi le problème que vous rencontrez (carte, paiement, " +
      "distributeur, application...) et je vous guiderai."
  );
}

// ---------- Affichage des messages ----------

function formatHeure(date) {
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Met en gras les intitules de section en debut de ligne (ex: "Delai de
// traitement estime :") pour aerer visuellement les reponses du bot, sans
// dependre d'un format fige cote backend. Le texte est d'abord echappe
// (protection XSS), le gras est applique APRES sur le HTML echappe.
function libelleLisible(code) {
  if (!code) return "";
  return code
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formaterReponseBot(texte) {
  const echappe = escapeHtml(texte);
  return echappe.replace(/^([^\n:]{3,70}) ?:/gm, (_, label) => `<strong>${label.trim()} :</strong>`);
}

function ajouterMessage(role, texte, options) {
  options = options || {};
  const isUser = role === "user";

  const row = document.createElement("div");
  row.className =
    "msg-row " + (isUser ? "msg-row--user" : "msg-row--bot") + (options.degrade ? " msg-row--degrade" : "");

  const avatar = document.createElement("span");
  avatar.className = "msg-avatar " + (isUser ? "msg-avatar--user" : "msg-avatar--bot");
  avatar.innerHTML = isUser ? ICON_USER : ICON_BOT;

  const bubbleWrap = document.createElement("div");
  bubbleWrap.className = "msg-bubble-wrap";

  if (!isUser && options.sous_categorie) {
    const badge = document.createElement("span");
    badge.className = "msg-category-badge";
    badge.textContent = "🎯 " + libelleLisible(options.sous_categorie);
    bubbleWrap.appendChild(badge);
  }

  if (options.degrade) {
    const bandeau = document.createElement("div");
    bandeau.className = "msg-degrade-banner";
    bandeau.innerHTML = `<span class="msg-degrade-icon">${ICON_WARNING}</span> Service ralenti — votre demande a été transmise à un conseiller`;
    bubbleWrap.appendChild(bandeau);
  }

  const bubble = document.createElement("div");
  bubble.className = "msg" + (options.erreur ? " msg-error" : "") + (options.degrade ? " msg-degrade" : "");
  if (isUser) {
    bubble.textContent = texte;
  } else {
    // Pour le bot : on met en gras les intitules de section ("Delai de
    // traitement estime :", etc.) pour aerer la lecture, tout en echappant
    // le HTML pour eviter toute injection (le texte peut contenir des
    // fragments derives du message de l'utilisateur, ex. resume_precis).
    bubble.innerHTML = formaterReponseBot(texte);
  }

  const meta = document.createElement("div");
  meta.className = "msg-meta";

  const heure = document.createElement("span");
  heure.className = "msg-time";
  heure.textContent = formatHeure(new Date());
  meta.appendChild(heure);

  if (isUser) {
    const check = document.createElement("span");
    check.className = "msg-check";
    check.innerHTML = ICON_CHECK;
    meta.appendChild(check);
  } else if (!options.erreur) {
    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "msg-play";
    playBtn.title = "Écouter";
    playBtn.setAttribute("aria-label", "Écouter cette réponse");
    playBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
    playBtn.addEventListener("click", () => lireAudio(texte));
    meta.appendChild(playBtn);

    if (options.message_id) {
      meta.appendChild(construireFeedback(options.message_id));
    }
  }

  bubbleWrap.appendChild(bubble);
  bubbleWrap.appendChild(meta);
  row.appendChild(avatar);
  row.appendChild(bubbleWrap);
  messagesEl.appendChild(row);

  document.getElementById("view-chat").scrollTop = document.getElementById("view-chat").scrollHeight;
  return row;
}

function construireFeedback(messageId) {
  const wrap = document.createElement("span");
  wrap.className = "msg-feedback";

  const up = document.createElement("button");
  up.type = "button";
  up.className = "msg-feedback-btn";
  up.setAttribute("aria-label", "Réponse utile");
  up.innerHTML = ICON_THUMB_UP;

  const down = document.createElement("button");
  down.type = "button";
  down.className = "msg-feedback-btn";
  down.setAttribute("aria-label", "Réponse pas utile");
  down.innerHTML = ICON_THUMB_DOWN;

  function envoyer(rating, boutonActif, boutonInactif) {
    boutonActif.classList.add("is-active");
    boutonInactif.classList.remove("is-active");
    up.disabled = true;
    down.disabled = true;
    fetch(`${window.API_BASE_URL}/chat/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ message_id: messageId, rating }),
    }).catch(() => {});
  }

  up.addEventListener("click", () => envoyer(1, up, down));
  down.addEventListener("click", () => envoyer(-1, down, up));

  wrap.appendChild(up);
  wrap.appendChild(down);
  return wrap;
}

function showError(msg) {
  errorEl.textContent = msg || "";
}

function setTyping(visible) {
  typingRowEl.classList.toggle("hidden", !visible);
  if (visible) {
    const main = document.getElementById("view-chat");
    main.scrollTop = main.scrollHeight;
  }
}

function setEnvoiActif(actif) {
  inputEl.disabled = actif;
  document.getElementById("send-btn").disabled = actif;
}

// ---------- Piece jointe (justificatif) ----------

attachBtn.addEventListener("click", () => attachInput.click());

attachInput.addEventListener("change", () => {
  const fichier = attachInput.files[0];
  if (!fichier) return;

  const TAILLE_MAX = 8 * 1024 * 1024;
  if (fichier.size > TAILLE_MAX) {
    showError("Fichier trop volumineux (8 Mo maximum).");
    attachInput.value = "";
    return;
  }

  fichierEnAttente = fichier;
  attachPreviewEl.classList.remove("hidden");

  const estImage = fichier.type.startsWith("image/");

  if (estImage) {
    const urlApercu = URL.createObjectURL(fichier);
    attachPreviewEl.innerHTML = `
      <span class="attachment-chip attachment-chip--image">
        <img class="attachment-thumb" src="${urlApercu}" alt="Aperçu du justificatif" />
        <span class="attachment-name">${escapeHtml(fichier.name)}</span>
        <button type="button" class="attachment-remove" aria-label="Retirer le fichier joint">×</button>
      </span>
    `;
  } else {
    attachPreviewEl.innerHTML = `
      <span class="attachment-chip">
        ${ICON_PAPERCLIP}
        <span class="attachment-name">${escapeHtml(fichier.name)}</span>
        <button type="button" class="attachment-remove" aria-label="Retirer le fichier joint">×</button>
      </span>
    `;
  }
  attachPreviewEl.querySelector(".attachment-remove").addEventListener("click", effacerPieceJointe);
});

function effacerPieceJointe() {
  const img = attachPreviewEl.querySelector(".attachment-thumb");
  if (img && img.src) URL.revokeObjectURL(img.src);
  fichierEnAttente = null;
  attachInput.value = "";
  attachPreviewEl.classList.add("hidden");
  attachPreviewEl.innerHTML = "";
}

async function televerserJustificatif(reclamationId, fichier) {
  const formData = new FormData();
  formData.append("fichier", fichier);
  try {
    const res = await fetch(`${window.API_BASE_URL}/reclamations/${reclamationId}/justificatif`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.success) {
      showError((data && data.message) || "Le justificatif n'a pas pu être joint (fichier rejeté).");
      return false;
    }
    return true;
  } catch (err) {
    showError("Le justificatif n'a pas pu être joint (connexion au serveur impossible).");
    return false;
  }
}

// ---------- Envoi d'un message texte au chatbot ----------

const SUGGESTIONS_SUIVI = [
  { label: "⏱️ Combien de temps ?", texte: "Combien de temps pour le traitement de ma réclamation ?" },
  { label: "🧑 Parler à un conseiller", texte: "Je veux parler à un conseiller." },
  { label: "➕ Autre problème", texte: null },
];

function ajouterSuggestionsRapides() {
  const rangees = messagesEl.querySelectorAll(".msg-row--bot");
  const derniereRangee = rangees[rangees.length - 1];
  if (!derniereRangee) return;

  const bubbleWrap = derniereRangee.querySelector(".msg-bubble-wrap");
  if (!bubbleWrap) return;

  const conteneur = document.createElement("div");
  conteneur.className = "followup-suggestions";

  SUGGESTIONS_SUIVI.forEach((sugg) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "followup-suggestion-btn";
    btn.textContent = sugg.label;
    btn.addEventListener("click", () => {
      conteneur.querySelectorAll("button").forEach((b) => (b.disabled = true));
      if (sugg.texte === null) {
        // "Autre probleme" : on laisse le client taper librement plutot
        // que d'envoyer un message tout fait.
        inputEl.focus();
        conteneur.remove();
        return;
      }
      envoyerMessage(sugg.texte);
    });
    conteneur.appendChild(btn);
  });

  bubbleWrap.appendChild(conteneur);
}

async function envoyerMessage(texte) {
  ajouterMessage("user", texte);
  showError("");
  setTyping(true);
  setEnvoiActif(true);

  const fichierAEnvoyer = fichierEnAttente;
  effacerPieceJointe();

  try {
    const res = await fetch(`${window.API_BASE_URL}/chat/repondre`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ texte, contexte_precedent: derniereCategorie }),
    });

    if (res.status === 401) {
      goToLogin();
      return;
    }

    const data = await res.json();
    setTyping(false);

    if (!res.ok || !data.success) {
      ajouterMessage("bot", data.message || "Le service chatbot n'a pas pu répondre. Réessayez.", { erreur: true });
      return;
    }

    if (!data.est_salutation) {
      derniereCategorie = data.sous_categorie;
    }
    if (data.reclamation_id) {
      dernierReclamationId = data.reclamation_id;
    }
    const categorieAffichee =
      !data.est_salutation && data.sous_categorie && data.sous_categorie !== "hors_sujet"
        ? data.sous_categorie
        : null;
    ajouterMessage("bot", data.reponse, {
      message_id: data.message_id,
      degrade: data.degrade,
      sous_categorie: categorieAffichee,
      problemes_secondaires: data.problemes_secondaires,
    });

    // Suggestions de suivi rapide : seulement apres une vraie reponse de
    // procedure (pas une salutation, pas une demande de clarification en
    // attente de precision).
    if (categorieAffichee && !data.besoin_clarification) {
      ajouterSuggestionsRapides();
    }

    if (fichierAEnvoyer) {
      const idCible = data.reclamation_id || dernierReclamationId;
      if (idCible) {
        await televerserJustificatif(idCible, fichierAEnvoyer);
      } else {
        showError(
          "Votre fichier n'a pas pu être joint : décrivez d'abord votre problème pour créer une réclamation."
        );
      }
    }
  } catch (err) {
    setTyping(false);
    ajouterMessage("bot", "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.", { erreur: true });
  } finally {
    setEnvoiActif(false);
    inputEl.focus();
  }
}

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const texte = inputEl.value.trim();

  if (!texte && !fichierEnAttente) return;

  if (!texte && fichierEnAttente) {
    // Fichier joint sans aucun texte : on l'attache DIRECTEMENT au ticket
    // en cours plutot que d'envoyer un message vide au chatbot (qui ne
    // decrit aucun probleme et ne fait donc que relancer une demande de
    // clarification, sans jamais reussir a joindre le fichier).
    const fichier = fichierEnAttente;
    effacerPieceJointe();

    if (dernierReclamationId) {
      setEnvoiActif(true);
      const ok = await televerserJustificatif(dernierReclamationId, fichier);
      setEnvoiActif(false);
      if (ok) {
        ajouterMessage("bot", "📎 Votre justificatif a bien été ajouté à votre réclamation en cours.");
      }
    } else {
      showError("Décrivez d'abord votre problème avant de joindre un justificatif.");
    }
    return;
  }

  inputEl.value = "";
  envoyerMessage(texte);
});

// ---------- Message vocal ----------
// En plus de l'enregistrement envoye a Whisper (Groq) pour la transcription
// finale (precise, utilisee comme message reellement envoye), on affiche si
// possible un sous-titrage "en direct" via l'API native de reconnaissance
// vocale du navigateur (Web Speech API). C'est un simple retour visuel
// immediat pendant que l'utilisateur parle — la transcription officielle
// reste toujours celle de Whisper, plus fiable, envoyee a la fin.
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

function demarrerSousTitrageDirect() {
  if (!SpeechRecognitionAPI) return;
  try {
    reconnaissanceVocale = new SpeechRecognitionAPI();
    reconnaissanceVocale.continuous = true;
    reconnaissanceVocale.interimResults = true;
    reconnaissanceVocale.lang = "fr-FR";

    voiceCaptionEl.classList.remove("hidden");
    voiceCaptionEl.textContent = "Je vous écoute…";

    reconnaissanceVocale.addEventListener("result", (event) => {
      let texte = "";
      for (let i = 0; i < event.results.length; i++) {
        texte += event.results[i][0].transcript;
      }
      voiceCaptionEl.textContent = texte || "Je vous écoute…";
    });
    reconnaissanceVocale.addEventListener("error", () => {});
    reconnaissanceVocale.start();
  } catch (err) {
    reconnaissanceVocale = null;
  }
}

function arreterSousTitrageDirect() {
  if (reconnaissanceVocale) {
    try {
      reconnaissanceVocale.stop();
    } catch (err) {}
    reconnaissanceVocale = null;
  }
  voiceCaptionEl.classList.add("hidden");
  voiceCaptionEl.textContent = "";
}

async function demarrerEnregistrement() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.addEventListener("dataavailable", (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    });

    mediaRecorder.addEventListener("stop", async () => {
      stream.getTracks().forEach((track) => track.stop());
      arreterSousTitrageDirect();
      const blob = new Blob(audioChunks, { type: "audio/webm" });
      await envoyerAudio(blob);
    });

    mediaRecorder.start();
    enregistrement = true;
    micBtn.classList.add("recording");
    demarrerSousTitrageDirect();
  } catch (err) {
    showError("Micro indisponible. Vérifiez les autorisations de votre navigateur.");
  }
}

function arreterEnregistrement() {
  if (mediaRecorder && enregistrement) {
    mediaRecorder.stop();
  }
  enregistrement = false;
  micBtn.classList.remove("recording");
}

micBtn.addEventListener("click", () => {
  if (enregistrement) {
    arreterEnregistrement();
  } else {
    demarrerEnregistrement();
  }
});

function blobEnBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function envoyerAudio(blob) {
  showError("");
  setEnvoiActif(true);
  try {
    const audio_base64 = await blobEnBase64(blob);
    const res = await fetch(`${window.API_BASE_URL}/chat/transcrire`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ audio_base64, nom_fichier: "reclamation.webm" }),
    });

    if (res.status === 401) {
      goToLogin();
      return;
    }

    const data = await res.json();
    setEnvoiActif(false);

    if (!res.ok || !data.success || !data.texte) {
      showError(data.message || "Impossible de transcrire l'audio. Réessayez ou tapez votre message.");
      return;
    }

    envoyerMessage(data.texte);
  } catch (err) {
    setEnvoiActif(false);
    showError("Impossible de transcrire l'audio. Réessayez ou tapez votre message.");
  }
}

// ---------- Synthèse vocale (écouter une réponse) ----------

async function lireAudio(texte) {
  try {
    const res = await fetch(`${window.API_BASE_URL}/chat/parler`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ texte, langue: /[\u0600-\u06FF]/.test(texte) ? "arabe" : "francais" }),
    });

    if (!res.ok) {
      showError("Impossible de générer l'audio pour ce message.");
      return;
    }

    const blob = await res.blob();
    ttsAudio.src = URL.createObjectURL(blob);
    ttsAudio.play();
  } catch (err) {
    showError("Impossible de générer l'audio pour ce message.");
  }
}

// ---------- Déconnexion ----------

logoutBtn.addEventListener("click", async () => {
  try {
    await fetch(`${window.API_BASE_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch (err) {
    // on se deconnecte cote client meme si l'appel echoue
  } finally {
    goToLogin();
  }
});

// =====================================================================
// Navigation laterale (vues statiques)
// =====================================================================

const VUES = {
  chat: { title: 'Chatbot Réclamations <span>Monétique</span>', status: "Assistant STB en ligne" },
  reclamations: { title: "Mes réclamations", status: "Historique de vos échanges" },
  faq: { title: "Foire aux questions", status: "Réponses aux questions fréquentes" },
  guides: { title: "Guides &amp; Aide", status: "Pas à pas pour vos démarches" },
  apropos: { title: "À propos", status: "Le service réclamations monétique STB" },
  dashboard: { title: "Tableau de bord", status: "Supervision des réclamations" },
};

function afficherVue(nomVue) {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    const estActif = btn.dataset.view === nomVue;
    btn.classList.toggle("is-active", estActif);
    if (estActif) {
      btn.setAttribute("aria-current", "page");
    } else {
      btn.removeAttribute("aria-current");
    }
  });

  document.getElementById("view-chat").classList.toggle("hidden", nomVue !== "chat");
  document.getElementById("view-chat-input").classList.toggle("hidden", nomVue !== "chat");
  ["reclamations", "faq", "guides", "apropos", "dashboard"].forEach((v) => {
    document.getElementById(`view-${v}`).classList.toggle("hidden", nomVue !== v);
  });

  const meta = VUES[nomVue];
  if (meta) {
    viewTitleEl.innerHTML = meta.title;
    document.querySelector(".chat-status").innerHTML =
      '<span class="status-dot"></span>' + meta.status;
  }

  if (sseEscalades) {
    sseEscalades.close();
    sseEscalades = null;
  }

  if (nomVue === "reclamations") renderVueReclamations();
  if (nomVue === "faq") renderVueFaq();
  if (nomVue === "guides") renderVueGuides();
  if (nomVue === "apropos") renderVueApropos();
  if (nomVue === "dashboard") renderVueDashboard();

  fermerSidebarMobile();
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    const vue = btn.dataset.view;
    if (vue === "chat") {
      demarrerNouvelleConversation();
    }
    afficherVue(vue);
  });
});

// ---------- Mes réclamations (donnees reelles) ----------

const LIBELLES_STATUT = { recu: "Reçue", en_cours: "En cours", resolu: "Résolue" };

function formatDate(iso) {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

async function renderVueReclamations() {
  const el = document.getElementById("view-reclamations");
  el.innerHTML = `<div class="static-hero"><h2>Mes réclamations</h2><p>Chargement…</p></div>`;

  try {
    const res = await fetch(`${window.API_BASE_URL}/reclamations`, { credentials: "include" });
    const data = await res.json();
    const liste = (data && data.data) || [];

    if (liste.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          </span>
          <h3>Aucune réclamation enregistrée</h3>
          <p>Les réclamations que vous déposez via le chat apparaîtront ici avec leur statut de traitement.</p>
        </div>`;
      return;
    }

    el.innerHTML =
      `<div class="static-hero"><h2>Mes réclamations</h2><p>${liste.length} réclamation(s) enregistrée(s).</p></div>` +
      liste
        .map(
          (r) => `
        <div class="ticket-item">
          <div class="ticket-item-top">
            <span class="ticket-category">${r.sous_categorie.replace(/_/g, " ")}</span>
            <span class="ticket-badge ticket-badge--${r.statut}">${LIBELLES_STATUT[r.statut] || r.statut}</span>
          </div>
          <p class="ticket-resume">${r.resume}</p>
          <div class="ticket-item-bottom">
            <span>#${r.id} · ${formatDate(r.updated_at)}</span>
            ${r.justificatif_path ? '<span class="ticket-attachment">📎 Justificatif joint</span>' : ""}
          </div>
        </div>`
        )
        .join("");
  } catch (err) {
    el.innerHTML = `<div class="static-hero"><h2>Mes réclamations</h2><p>Impossible de charger vos réclamations pour le moment.</p></div>`;
  }
}

const FAQ_ITEMS = [
  {
    q: "Ma carte a été refusée lors d'un paiement, que faire ?",
    r: "Décrivez le problème au chatbot (date, montant, commerçant si possible) dans « Nouvelle conversation » : il identifie la cause probable et vous indique la marche à suivre.",
  },
  {
    q: "J'ai perdu ma carte ou on me l'a volée",
    r: "Faites opposition immédiatement via le centre d'appel ou votre agence. Le chatbot peut aussi vous guider et transmettre votre demande.",
  },
  {
    q: "Combien de temps prend le traitement d'une réclamation ?",
    r: "Le délai dépend du type de réclamation (de quelques minutes pour une opposition à plusieurs jours pour une contestation de transaction). Le chatbot vous donne le délai estimé selon votre cas.",
  },
  {
    q: "Puis-je parler à un conseiller humain ?",
    r: "Oui, à tout moment : cliquez sur « Contacter un conseiller » dans le menu, ou dites-le simplement au chatbot pendant votre conversation.",
  },
];

function renderVueFaq() {
  const el = document.getElementById("view-faq");
  el.innerHTML =
    `<div class="static-hero"><h2>Foire aux questions</h2><p>Les réponses les plus demandées sur les réclamations monétiques.</p></div>` +
    FAQ_ITEMS.map(
      (item) => `
      <div class="faq-item">
        <h3>${item.q}</h3>
        <p>${item.r}</p>
      </div>`
    ).join("");
}

const GUIDE_ITEMS = [
  {
    titre: "Faire opposition à une carte perdue ou volée",
    texte: "Ouvrez une conversation et décrivez la situation (« j'ai perdu ma carte »). Le chatbot vous confirme la démarche et le délai de remplacement.",
  },
  {
    titre: "Contester une transaction non reconnue",
    texte: "Indiquez la date, le montant et le commerçant concerné. Gardez vos justificatifs (relevé, reçu) en cas de besoin lors du traitement.",
  },
  {
    titre: "Signaler un retrait DAB non délivré",
    texte: "Précisez le distributeur, l'heure et le montant retiré. Le service vérifie l'opération et vous recontacte selon le délai indiqué.",
  },
];

function renderVueGuides() {
  const el = document.getElementById("view-guides");
  el.innerHTML =
    `<div class="static-hero"><h2>Guides &amp; Aide</h2><p>Pas à pas pour vos démarches les plus courantes.</p></div>` +
    GUIDE_ITEMS.map(
      (item, i) => `
      <div class="guide-item">
        <h3><span class="step-num">${i + 1}</span>${item.titre}</h3>
        <p>${item.texte}</p>
      </div>`
    ).join("");
}

function renderVueApropos() {
  const el = document.getElementById("view-apropos");
  el.innerHTML = `
    <div class="static-hero"><h2>À propos</h2><p>Le service réclamations monétique STB.</p></div>
    <div class="apropos-body">
      <p>Ce chatbot vous aide à décrire et suivre vos réclamations liées aux cartes bancaires, paiements, distributeurs automatiques et à l'application mobile STB.</p>
      <p>Il comprend le français, l'anglais, l'arabe et le dialecte tunisien, à l'écrit comme à l'oral (message vocal).</p>
      <p>Pour toute question ne relevant pas du monétique, ou si vous préférez un échange humain, utilisez le bouton « Contacter un conseiller ».</p>
    </div>
  `;
}

// ---------- Tableau de bord superviseur (role admin) ----------

async function renderVueDashboard() {
  const el = document.getElementById("view-dashboard");
  el.innerHTML = `<div class="static-hero"><h2>Tableau de bord</h2><p>Chargement…</p></div>`;

  try {
    const res = await fetch(`${window.API_BASE_URL}/agent/stats`, { credentials: "include" });
    const data = await res.json();
    if (!res.ok || !data.success) {
      el.innerHTML = `<div class="static-hero"><h2>Tableau de bord</h2><p>Accès réservé aux superviseurs.</p></div>`;
      return;
    }

    const { parCategorie, parStatut } = data.data;
    const maxCategorie = Math.max(1, ...parCategorie.map((c) => c.total));

    el.innerHTML = `
      <div class="static-hero"><h2>Tableau de bord</h2><p>Vue d'ensemble des réclamations traitées par le chatbot.</p></div>

      <div class="dashboard-grid">
        <div class="dashboard-card">
          <h3>Réclamations par statut</h3>
          <div class="dashboard-statuts">
            ${["recu", "en_cours", "resolu"]
              .map((s) => {
                const trouve = parStatut.find((p) => p.statut === s);
                return `<div class="dashboard-statut-item">
                  <span class="ticket-badge ticket-badge--${s}">${LIBELLES_STATUT[s]}</span>
                  <strong>${trouve ? trouve.total : 0}</strong>
                </div>`;
              })
              .join("")}
          </div>
        </div>

        <div class="dashboard-card">
          <h3>Sous-catégories les plus fréquentes</h3>
          ${
            parCategorie.length === 0
              ? '<p class="dashboard-empty">Aucune donnée pour le moment.</p>'
              : parCategorie
                  .slice(0, 8)
                  .map(
                    (c) => `
              <div class="dashboard-bar-row">
                <span class="dashboard-bar-label">${c.sous_categorie.replace(/_/g, " ")}</span>
                <div class="dashboard-bar-track">
                  <div class="dashboard-bar-fill" style="width:${Math.max(6, (c.total / maxCategorie) * 100)}%"></div>
                </div>
                <span class="dashboard-bar-value">${c.total}</span>
              </div>`
                  )
                  .join("")
          }
        </div>
      </div>

      <div class="dashboard-card">
        <h3>File d'attente — demandes d'assistance humaine</h3>
        <div id="dashboard-escalades"><p class="dashboard-empty">Connexion au flux en direct…</p></div>
      </div>
    `;

    demarrerFluxEscalades();
  } catch (err) {
    el.innerHTML = `<div class="static-hero"><h2>Tableau de bord</h2><p>Impossible de charger les statistiques.</p></div>`;
  }
}

function demarrerFluxEscalades() {
  const conteneur = document.getElementById("dashboard-escalades");
  if (!conteneur) return;

  sseEscalades = new EventSource(`${window.API_BASE_URL}/agent/escalades/stream`, { withCredentials: true });

  sseEscalades.onmessage = (event) => {
    const liste = JSON.parse(event.data);
    if (liste.length === 0) {
      conteneur.innerHTML = '<p class="dashboard-empty">Aucune demande en attente. 🎉</p>';
      return;
    }
    conteneur.innerHTML = liste
      .map(
        (r) => `
      <div class="escalade-item" data-id="${r.id}">
        <div>
          <strong>${r.agent_nom}</strong> — ${r.sous_categorie.replace(/_/g, " ")}
          <p class="escalade-resume">${r.resume}</p>
          <span class="ticket-item-bottom">#${r.id} · ${formatDate(r.updated_at)}</span>
        </div>
        <button type="button" class="btn-outline-sm escalade-traiter-btn">Traiter</button>
      </div>`
      )
      .join("");

    conteneur.querySelectorAll(".escalade-traiter-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.closest(".escalade-item").dataset.id;
        btn.disabled = true;
        await fetch(`${window.API_BASE_URL}/agent/reclamations/${id}/escalade-traitee`, {
          method: "POST",
          credentials: "include",
        });
      });
    });
  };

  sseEscalades.onerror = () => {
    // Le navigateur retente automatiquement la connexion SSE ; rien a faire.
  };
}

// =====================================================================
// Modale « Contacter un conseiller »
// =====================================================================

const contactBtn = document.getElementById("contact-btn");
const contactModal = document.getElementById("contact-modal");
const contactModalClose = document.getElementById("contact-modal-close");

function ouvrirModaleContact() {
  contactModal.classList.remove("hidden");
  contactModalClose.focus();
  fermerSidebarMobile();
}
function fermerModaleContact() {
  contactModal.classList.add("hidden");
  contactBtn.focus();
}

contactBtn.addEventListener("click", ouvrirModaleContact);
contactModalClose.addEventListener("click", fermerModaleContact);
contactModal.addEventListener("click", (e) => {
  if (e.target === contactModal) fermerModaleContact();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !contactModal.classList.contains("hidden")) {
    fermerModaleContact();
  }
});

// =====================================================================
// Menu lateral mobile
// =====================================================================

const sidebarEl = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");

function ouvrirSidebarMobile() {
  sidebarEl.classList.add("is-open");
  sidebarBackdrop.classList.add("is-open");
}
function fermerSidebarMobile() {
  sidebarEl.classList.remove("is-open");
  sidebarBackdrop.classList.remove("is-open");
}

document.getElementById("sidebar-open").addEventListener("click", ouvrirSidebarMobile);
document.getElementById("sidebar-close").addEventListener("click", fermerSidebarMobile);
sidebarBackdrop.addEventListener("click", fermerSidebarMobile);

verifierSession();
