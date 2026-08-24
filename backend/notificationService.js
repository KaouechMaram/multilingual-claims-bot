// notificationService.js
// Notifie un utilisateur (email/SMS) quand le statut d'une reclamation
// change.
//
// ⚠️ CECI EST UN STUB. Aucun email ni SMS n'est reellement envoye : chaque
// notification est journalisee (console + table `notifications_log`) avec
// le statut "simule", pour que le comportement reste visible et testable
// sans depenser un budget d'envoi ni exiger de compte fournisseur pendant
// le developpement/la demonstration.
//
// Pour brancher un vrai envoi en production, remplacez le contenu de
// `envoyerEmail`/`envoyerSms` ci-dessous par un vrai appel API, par exemple :
//   - Email : nodemailer (SMTP), SendGrid, AWS SES...
//   - SMS   : Twilio, Vonage...
// L'interface exportee (envoyerNotification) ne changerait pas : seuls ces
// deux details d'implementation seraient a remplacer.

const db = require("./db");

async function envoyerEmail(destinataire, sujet, corps) {
  // TODO (production) : remplacer par un vrai envoi, ex. avec nodemailer :
  //   const transporter = nodemailer.createTransport({ ... });
  //   await transporter.sendMail({ to: destinataire, subject: sujet, text: corps });
  console.log(`📧 [SIMULATION EMAIL] à ${destinataire} — "${sujet}"\n   ${corps}`);
  return { statut: "simule" };
}

async function envoyerSms(destinataire, corps) {
  // TODO (production) : remplacer par un vrai envoi, ex. avec Twilio :
  //   await twilioClient.messages.create({ to: destinataire, body: corps, from: "..." });
  console.log(`📱 [SIMULATION SMS] à ${destinataire} — ${corps}`);
  return { statut: "simule" };
}

const LIBELLES_STATUT = {
  recu: "reçue",
  en_cours: "en cours de traitement",
  resolu: "résolue",
};

async function notifierChangementStatut({ reclamation_id, destinataire, canal, statut, sous_categorie }) {
  const libelle = LIBELLES_STATUT[statut] || statut;
  const contenu =
    `Votre réclamation #${reclamation_id} (${sous_categorie}) est maintenant : ${libelle}.`;

  const resultat =
    canal === "sms"
      ? await envoyerSms(destinataire, contenu)
      : await envoyerEmail(destinataire, `Mise à jour de votre réclamation #${reclamation_id}`, contenu);

  db.prepare(
    `INSERT INTO notifications_log (reclamation_id, canal, destinataire, contenu, statut)
     VALUES (?, ?, ?, ?, ?)`
  ).run(reclamation_id, canal, destinataire, contenu, resultat.statut);

  return resultat;
}

module.exports = { notifierChangementStatut };
