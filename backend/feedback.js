// feedback.js
// Retours utilisateur (pouce leve/baisse) sur les reponses du bot. Un seul
// avis par message et par utilisateur (contrainte UNIQUE en base) : un
// second clic remplace le premier plutot que d'en ajouter un nouveau.

const db = require("./db");

function enregistrerFeedback({ message_id, user_id, rating }) {
  if (rating !== 1 && rating !== -1) {
    throw new Error("rating doit valoir 1 ou -1.");
  }
  const message = db.prepare("SELECT id FROM messages WHERE id = ?").get(message_id);
  if (!message) {
    throw new Error("Message introuvable.");
  }

  db.prepare(
    `INSERT INTO feedback (message_id, user_id, rating)
     VALUES (?, ?, ?)
     ON CONFLICT(message_id, user_id) DO UPDATE SET rating = excluded.rating`
  ).run(message_id, user_id, rating);

  return db
    .prepare("SELECT * FROM feedback WHERE message_id = ? AND user_id = ?")
    .get(message_id, user_id);
}

module.exports = { enregistrerFeedback };
