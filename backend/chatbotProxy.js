// chatbotProxy.js
// Fait le pont entre le backend Node et le microservice Python (FastAPI)
// qui contient toute la logique du chatbot (classification, RAG, voix).
//
// Le frontend n'appelle JAMAIS le service Python directement : il passe
// toujours par les routes Node (server.js), deja protegees par requireAuth.
//
// En plus de ca, chaque appel vers le service Python porte une cle interne
// partagee (X-Internal-Api-Key). Deuxieme barriere independante du JWT :
// meme si le port du service Python (8001) etait expose au public par
// erreur de configuration reseau, il refuserait toute requete sans cette
// cle (voir chatbot-api/main.py).
//
// Ce module expose des fonctions "pures" (appellerChatbotRepondre,
// appellerChatbotTranscrire) plutot que de repondre directement au client :
// c'est server.js qui orchestre l'appel + la persistance en base (ticket,
// message, escalade) + la reponse HTTP finale.

const CHATBOT_API_URL = process.env.CHATBOT_API_URL || "http://localhost:8001";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

function headersInternes(extra) {
  return Object.assign(
    { "X-Internal-Api-Key": INTERNAL_API_KEY },
    extra || {}
  );
}

async function appellerChatbotRepondre(texte, contexte_precedent) {
  const upstream = await fetch(`${CHATBOT_API_URL}/repondre`, {
    method: "POST",
    headers: headersInternes({ "Content-Type": "application/json" }),
    body: JSON.stringify({ texte, contexte_precedent: contexte_precedent || null }),
  });

  const data = await upstream.json().catch(() => null);

  if (!upstream.ok || !data) {
    const err = new Error((data && data.detail) || "Le service chatbot n'a pas pu répondre.");
    err.status = upstream.status || 502;
    throw err;
  }

  return data; // { reponse, sous_categorie, est_salutation, resume_precis, problemes_secondaires, escalade_humaine, degrade }
}

async function appellerChatbotTranscrire(audio_base64, nom_fichier) {
  const upstream = await fetch(`${CHATBOT_API_URL}/transcrire`, {
    method: "POST",
    headers: headersInternes({ "Content-Type": "application/json" }),
    body: JSON.stringify({ audio_base64, nom_fichier: nom_fichier || "reclamation.webm" }),
  });

  const data = await upstream.json().catch(() => null);

  if (!upstream.ok || !data) {
    const err = new Error((data && data.detail) || "Transcription impossible.");
    err.status = upstream.status || 502;
    throw err;
  }

  return data; // { texte }
}

// Convertit du texte en audio (mp3) et renvoie directement le flux binaire.
// Route "passthrough" simple : pas de persistance necessaire ici.
async function proxyParler(req, res) {
  const { texte, langue } = req.body || {};

  if (!texte || !String(texte).trim()) {
    return res.status(400).json({ success: false, message: "Texte vide." });
  }

  try {
    const upstream = await fetch(`${CHATBOT_API_URL}/parler`, {
      method: "POST",
      headers: headersInternes({ "Content-Type": "application/json" }),
      body: JSON.stringify({ texte, langue: langue || "francais" }),
    });

    if (!upstream.ok) {
      return res.status(upstream.status || 502).json({
        success: false,
        message: "Impossible de générer l'audio.",
      });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    res.set("Content-Type", "audio/mpeg");
    return res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    return res.status(502).json({
      success: false,
      message: "Service chatbot indisponible. Réessayez dans quelques instants.",
    });
  }
}

module.exports = { appellerChatbotRepondre, appellerChatbotTranscrire, proxyParler };
