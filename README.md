# Chatbot Réclamations Monétique — STB Bank
Authentification + chatbot, intégrés sur une seule interface web, avec
suivi réel des réclamations et supervision côté agent.

## Architecture

```
stb-auth/
├── backend/          API Node.js / Express
│   ├── server.js              routes HTTP, orchestration
│   ├── db.js                  connexion SQLite + schema (node:sqlite)
│   ├── users.js                comptes, politique de mot de passe
│   ├── reclamations.js         tickets, messages, stats agent
│   ├── feedback.js             notation 👍/👎 des réponses du bot
│   ├── notificationService.js  notifications email/SMS (stub documenté)
│   ├── uploadMiddleware.js     upload de justificatifs (Multer)
│   ├── authMiddleware.js       JWT (cookie httpOnly) + contrôle de rôle
│   ├── chatbotProxy.js         appels internes vers chatbot-api
│   ├── auditLog.js             journal des évènements de sécurité
│   ├── scripts/add-user.js
│   └── .env.example
├── chatbot-api/      Microservice Python / FastAPI
│   ├── main.py           classification (+cache), RAG, voix, mode dégradé
│   ├── knowledge_base.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── index.html    page de connexion
    ├── chat.html      chat + réclamations + FAQ + tableau de bord agent
    ├── styles.css / chat.css
    ├── script.js / chat.js
    └── config.js
```

**Flux** : connexion → cookie de session httpOnly → `chat.html`. Chaque
message passe par le backend Node (`/api/chat/repondre`), qui appelle le
microservice Python puis **persiste** la conversation : un ticket
(réclamation) est créé ou mis à jour en base SQLite, avec sous-catégorie,
statut, et messages liés.

## Fonctionnalités

### Côté utilisateur (rôle `agent`)
- **Chat textuel et vocal** (micro → transcription Whisper ; sous-titrage en
  direct via la reconnaissance vocale du navigateur pendant l'enregistrement,
  la transcription finale envoyée restant celle de Whisper — plus fiable).
- **Boutons de réponse rapide** (Carte / Paiement / DAB / Application) pour
  les cas fréquents, en plus du texte libre.
- **Upload de justificatif** (photo ou PDF, 8 Mo max) joint à une
  réclamation, stocké dans un dossier isolé par utilisateur avec nom de
  fichier aléatoire, accessible uniquement à son propriétaire (ou à un
  superviseur).
- **Mes réclamations** : historique réel de vos tickets, avec statut
  (reçue / en cours / résolue) et indicateur de justificatif joint.
- **Notation des réponses** (👍/👎) sur chaque réponse du bot.
- **Écoute des réponses** (synthèse vocale FR/AR).

### Côté superviseur (rôle `admin`)
- **Tableau de bord** : répartition des réclamations par statut et par
  sous-catégorie (les plus fréquentes en premier).
- **File d'attente des demandes d'assistance humaine**, mise à jour en
  temps réel (Server-Sent Events) sans rafraîchissement manuel, avec
  bouton "Traiter" pour marquer une escalade comme prise en charge.
- **Changement de statut d'une réclamation**, qui déclenche automatiquement
  une notification (email — voir note ci-dessous).

Compte de démonstration superviseur : **identifiant** `admin` /
**mot de passe** `Admin1234!`

### Qualité de la classification (côté `chatbot-api`)
- **Cache de classification** en mémoire (LRU, 1h de TTL) : deux messages
  identiques/quasi identiques n'appellent pas Groq deux fois.
- **Mode dégradé explicite** si Groq est injoignable : le client est
  prévenu honnêtement plutôt que de recevoir une classification par
  défaut présentée avec une fausse assurance, et une escalade humaine est
  déclenchée automatiquement (ticket créé, visible dans la file d'attente
  superviseur).
- **Exemples darija** intégrés au prompt de classification pour mieux
  reconnaître les formulations informelles fréquentes.

### ⚠️ Notifications email/SMS — stub, pas d'envoi réel
`notificationService.js` **simule** l'envoi (journalisé en console et dans
la table `notifications_log`) plutôt que d'envoyer réellement un email/SMS,
car aucun compte SMTP/Twilio n'est configuré dans cet environnement.
L'interface est prête pour un vrai branchement (nodemailer, SendGrid,
Twilio...) — voir les commentaires dans le fichier pour le point exact à
remplacer.

## Sécurité — récapitulatif

Voir les commentaires dans `server.js`, `authMiddleware.js`,
`uploadMiddleware.js` et `chatbot-api/main.py` pour le détail. En résumé :
mots de passe bcrypt, base SQLite avec requêtes préparées, cookie de
session httpOnly (jamais de JWT en `localStorage`), politique de mot de
passe, rate limiting (connexion + chat), verrouillage de compte, clé
interne partagée protégeant `chatbot-api` même en cas d'exposition
accidentelle, contrôle d'accès par rôle sur les routes superviseur,
isolation des fichiers uploadés par utilisateur, gestion d'erreurs
centralisée (aucune pile d'appels renvoyée au client), garde-fou empêchant
le démarrage en production avec des secrets par défaut, journal d'audit.

## 1. Démarrer le backend Node

```bash
cd backend
cp .env.example .env
```

Générez et collez de vraies valeurs pour `JWT_SECRET` et
`INTERNAL_API_KEY` (la seconde doit être **identique** dans
`chatbot-api/.env`, étape suivante) :
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```bash
npm install
npm start
```

> Nécessite **Node.js ≥ 22.5** (le module `node:sqlite` intégré est utilisé
> pour la base de données — aucune compilation native requise, contrairement
> à des paquets comme `better-sqlite3`).

Démarre sur **http://localhost:4000**. Comptes de démonstration créés
automatiquement :
- **Agent** : `demo` / `Demo1234!`
- **Superviseur** : `admin` / `Admin1234!`

Pour ajouter un utilisateur (mot de passe conforme à la politique exigée) :
```bash
npm run add-user -- identifiant "Nom Complet" MotDePasse2026 agent
```

## 2. Démarrer le microservice chatbot Python

```bash
cd chatbot-api
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Éditez `.env` : `GROQ_API_KEY` (votre clé) et `INTERNAL_API_KEY` (même
valeur que dans `backend/.env`).

```bash
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

## 3. Ouvrir le frontend

```bash
cd frontend
npx serve .
```

Connectez-vous, puis testez le tableau de bord en vous connectant avec le
compte `admin` dans un autre navigateur/onglet privé pendant qu'une
conversation est en cours avec `demo`.

## Points restants à adapter avant une mise en production réelle

1. Brancher un vrai envoi email/SMS dans `notificationService.js`.
2. Servir le site en HTTPS uniquement.
3. Remplacer `knowledge_base.py` par les vraies procédures internes STB.
4. Ajouter une authentification à deux facteurs (2FA) si nécessaire.
5. Héberger `chatbot-api` sur un réseau strictement privé.
6. Sauvegarder régulièrement `backend/stb.db` (contient désormais les
   réclamations et justificatifs des utilisateurs, pas seulement les
   comptes) et `backend/uploads/`.
7. Faire auditer le code par l'équipe sécurité de la banque avant toute
   mise en production avec de vraies données clients.
