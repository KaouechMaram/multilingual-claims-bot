// reclamations.js
// Couche d'acces aux donnees pour les reclamations (tickets), les messages
// de conversation qui leur sont lies, et les statistiques utilisees par le
// tableau de bord agent.

const db = require("./db");

// Sous-categories techniques qui ne representent pas une vraie reclamation
// (accueil, hors-sujet reel). On ne cree PAS de ticket pour celles-ci, sauf
// si une escalade humaine est explicitement demandee (ex: mode degrade,
// demande de parler a un conseiller).
const CATEGORIES_SANS_TICKET = new Set(["salutation", "hors_sujet", "demande_agent"]);

// Une reclamation ouverte recemment (moins de 2h) sur la meme sous-categorie
// est consideree comme la suite de la meme conversation plutot qu'un
// nouveau ticket.
const FENETRE_REOUVERTURE_MS = 2 * 60 * 60 * 1000;

function _row(id) {
  return db.prepare("SELECT * FROM reclamations WHERE id = ?").get(id);
}

// Cree une reclamation, ou reutilise/reactive celle deja ouverte sur le
// meme sujet pour cet utilisateur. Retourne la ligne (ou null si le message
// ne justifie pas de ticket : salutation, hors-sujet sans escalade...).
function creerOuMettreAJourReclamation({ user_id, sous_categorie, resume, escalade_humaine }) {
  const justifieUnTicket = escalade_humaine || !CATEGORIES_SANS_TICKET.has(sous_categorie);
  if (!justifieUnTicket) return null;

  const seuil = new Date(Date.now() - FENETRE_REOUVERTURE_MS).toISOString();
  const existante = db
    .prepare(
      `SELECT * FROM reclamations
       WHERE user_id = ? AND sous_categorie = ? AND statut != 'resolu' AND updated_at >= ?
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(user_id, sous_categorie, seuil);

  if (existante) {
    db.prepare(
      `UPDATE reclamations
       SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           escalade_humaine = MAX(escalade_humaine, ?),
           escalade_traitee = CASE WHEN ? = 1 AND escalade_humaine = 0 THEN 0 ELSE escalade_traitee END
       WHERE id = ?`
    ).run(escalade_humaine ? 1 : 0, escalade_humaine ? 1 : 0, existante.id);
    return _row(existante.id);
  }

  const info = db
    .prepare(
      `INSERT INTO reclamations (user_id, sous_categorie, resume, escalade_humaine)
       VALUES (?, ?, ?, ?)`
    )
    .run(user_id, sous_categorie, resume.slice(0, 300), escalade_humaine ? 1 : 0);

  return _row(Number(info.lastInsertRowid));
}

function ajouterMessage({ reclamation_id, user_id, role, texte, sous_categorie, degrade }) {
  const info = db
    .prepare(
      `INSERT INTO messages (reclamation_id, user_id, role, texte, sous_categorie, degrade)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(reclamation_id || null, user_id, role, texte, sous_categorie || null, degrade ? 1 : 0);

  return db.prepare("SELECT * FROM messages WHERE id = ?").get(Number(info.lastInsertRowid));
}

function attacherJustificatif(reclamation_id, cheminFichier) {
  db.prepare(
    `UPDATE reclamations SET justificatif_path = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
  ).run(cheminFichier, reclamation_id);
  return _row(reclamation_id);
}

function listerParUtilisateur(user_id) {
  return db
    .prepare("SELECT * FROM reclamations WHERE user_id = ? ORDER BY updated_at DESC")
    .all(user_id);
}

function obtenirAvecMessages(id, user_id) {
  const reclamation = db
    .prepare("SELECT * FROM reclamations WHERE id = ? AND user_id = ?")
    .get(id, user_id);
  if (!reclamation) return null;

  const messages = db
    .prepare("SELECT * FROM messages WHERE reclamation_id = ? ORDER BY created_at ASC")
    .all(id);

  return { ...reclamation, messages };
}

// ---------- Cote agent / supervision ----------

function listerToutes({ statut } = {}) {
  if (statut) {
    return db
      .prepare(
        `SELECT r.*, u.fullName AS agent_nom, u.username AS agent_username
         FROM reclamations r JOIN users u ON u.id = r.user_id
         WHERE r.statut = ?
         ORDER BY r.updated_at DESC`
      )
      .all(statut);
  }
  return db
    .prepare(
      `SELECT r.*, u.fullName AS agent_nom, u.username AS agent_username
       FROM reclamations r JOIN users u ON u.id = r.user_id
       ORDER BY r.updated_at DESC
       LIMIT 200`
    )
    .all();
}

function mettreAJourStatut(id, statut) {
  const STATUTS_VALIDES = new Set(["recu", "en_cours", "resolu"]);
  if (!STATUTS_VALIDES.has(statut)) {
    throw new Error("Statut invalide.");
  }
  db.prepare(
    `UPDATE reclamations SET statut = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
  ).run(statut, id);
  return _row(id);
}

function marquerEscaladeTraitee(id) {
  db.prepare(
    `UPDATE reclamations SET escalade_traitee = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
  ).run(id);
  return _row(id);
}

function listerEscaladesEnAttente() {
  return db
    .prepare(
      `SELECT r.*, u.fullName AS agent_nom
       FROM reclamations r JOIN users u ON u.id = r.user_id
       WHERE r.escalade_humaine = 1 AND r.escalade_traitee = 0
       ORDER BY r.updated_at ASC`
    )
    .all();
}

function statsParCategorie() {
  return db
    .prepare(
      `SELECT sous_categorie, COUNT(*) AS total
       FROM reclamations
       GROUP BY sous_categorie
       ORDER BY total DESC`
    )
    .all();
}

function statsParStatut() {
  return db
    .prepare(`SELECT statut, COUNT(*) AS total FROM reclamations GROUP BY statut`)
    .all();
}

module.exports = {
  creerOuMettreAJourReclamation,
  ajouterMessage,
  attacherJustificatif,
  listerParUtilisateur,
  obtenirAvecMessages,
  listerToutes,
  mettreAJourStatut,
  marquerEscaladeTraitee,
  listerEscaladesEnAttente,
  statsParCategorie,
  statsParStatut,
};
