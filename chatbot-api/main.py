# -*- coding: utf-8 -*-
"""
API FastAPI - Chatbot Reclamations Monetique STB
==================================================

Ce service expose en HTTP la logique Python existante (classification,
reponse RAG deterministe, transcription vocale, synthese vocale) qui
tournait jusqu'ici dans le script `28_rag_repondre.py` / l'app Streamlit.

Il n'est PAS expose directement au navigateur : c'est le backend Node.js
(`backend/server.js`, via `chatbotProxy.js`) qui l'appelle en interne et qui
reste seul responsable de l'authentification (verification du JWT). Ce
service ne doit donc etre accessible que depuis le serveur Node (localhost,
reseau interne, ou reseau Docker prive) - jamais ouvert publiquement.

Installation :
    pip install -r requirements.txt

Configuration (fichier .env, voir .env.example) :
    GROQ_API_KEY     cle API Groq (obligatoire)
    ALLOWED_ORIGIN    origine autorisee en CORS (URL du backend Node)

Lancement :
    uvicorn main:app --host 0.0.0.0 --port 8001 --reload

NOTE SUR LE MODELE (openai/gpt-oss-120b) :
    C'est un modele "raisonneur" : il consomme une partie du budget
    max_tokens pour son raisonnement interne AVANT de produire la reponse
    finale. Avec un max_tokens trop bas, il epuise ce budget dans le
    raisonnement et ne produit jamais la reponse -> erreur Groq
    "json_validate_failed" avec failed_generation vide. D'ou les valeurs
    de max_tokens plus larges ci-dessous, combinees a reasoning_effort="low"
    pour limiter la longueur du raisonnement.
"""

import io
import os
import re
import json
import base64
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from groq import Groq
from gtts import gTTS

from knowledge_base import KNOWLEDGE_BASE

load_dotenv()

GROQ_MODEL = "openai/gpt-oss-120b"
SOUS_CATEGORIES_VALIDES = list(KNOWLEDGE_BASE.keys())

# ---------------------------------------------------------------------------
# Logique metier (portee telle quelle depuis 28_rag_repondre.py /
# 31_app_streamlit.py, sans dependance a Streamlit)
# ---------------------------------------------------------------------------

MOTS_SALUTATION = [
    "bonjour", "bonsoir", "salut", "hello", "hi", "hey", "coucou",
    "marhba", "marhaba", "ahla", "ahlan", "salem", "salam", "salamu",
    "3aslema", "aslema", "sbah el khir", "sbeh lkhyr", "sbeh el khir",
    "sbeh lkheir", "sabah el kheir", "sabeh lkhir", "msa el khir",
    "msa lkhir", "3asba7 el khir",
    "merci", "thanks", "thank you", "ok", "test", "ça va", "ca va",
    "comment allez-vous", "how are you", "au revoir", "a bientot",
    "bye", "goodbye", "see you", "bsslema", "bslama", "3la slema",
    "yezzik", "chnowa", "kifak", "kifek", "kifach", "labes",
]

# Regles souples : au lieu d'exiger un mot EXACT (sensible aux variantes
# d'orthographe du darija, tres nombreuses car c'est une langue non
# standardisee a l'ecrit), on teste aussi des prefixes courants pour les
# formules de salutation les plus frequentes.
PREFIXES_SALUTATION_DARIJA = ("sbeh", "sbah", "sabah", "sabeh", "msa el", "msa lkhir")

MOTS_DEMANDE_AGENT = [
    "parler a un humain", "parler à un humain", "un agent", "un conseiller",
    "vrai personne", "talk to a human", "speak to an agent", "real person",
    "humain", "agent reel", "conseiller humain",
]

REPONSE_DEMANDE_AGENT = (
    "Bien sur, je transmets votre demande a un conseiller qui prendra le "
    "relais dans les plus brefs delais. En attendant, n'hesitez pas a me "
    "decrire votre probleme, cela accelerera le traitement de votre dossier."
)

REPONSE_SALUTATION = (
    "Bonjour et bienvenue au service reclamations monetique de la STB. "
    "Comment puis-je vous aider aujourd'hui ? Decrivez-moi le probleme que "
    "vous rencontrez (carte, paiement, distributeur, application...) et je "
    "vous guiderai."
)

CLASSIFICATION_PROMPT = f"""Tu es l'assistant de classification du service
reclamations monetique de la STB (Tunisie). Le client peut ecrire en
francais, en anglais, en arabe standard, ou en darija tunisien (arabe
dialectal ecrit en lettres latines, ex: "chna" "barcha" "mte3i" "3andi").
Tu dois comprendre ces 4 formes aussi bien les unes que les autres.

Les sous-categories valides, exactement comme ecrites, sont :
{', '.join(SOUS_CATEGORIES_VALIDES)}

TA TACHE (reponds en JSON avec exactement ces 5 champs) :

1. "sous_categorie" : LE probleme PRINCIPAL du message, une seule valeur
   parmi la liste ci-dessus. Si le client decrit plusieurs problemes dans
   le meme message (ex: "j'ai 2 cartes bloquees et un paiement refuse"),
   choisis celui qui semble le plus urgent ou le plus detaille, et signale
   les autres dans "problemes_secondaires".

2. "problemes_secondaires" : liste des AUTRES sous-categories valides
   mentionnees dans le meme message, si il y en a. Liste vide [] si un
   seul probleme est mentionne. Ne force jamais un probleme qui n'est pas
   clairement present.

3. "resume_precis" : UNE phrase courte en francais (pas de traduction
   litterale, une vraie reformulation naturelle), qui reprend les DETAILS
   CONCRETS donnes par le client (nombre de cartes, montant, date, nom de
   commerce, type de transaction...) si il y en a. Exemple : le client
   ecrit "3andi divx cartes bloquin, wa7da mte3 compte courant" -> resume :
   "Vous avez deux cartes bloquees, dont une liee a votre compte courant."
   Si le client ne donne aucun detail specifique, resume simplement le
   probleme en une phrase neutre sans rien inventer.

4. "besoin_clarification" : true UNIQUEMENT si le message est trop vague
   pour determiner meme approximativement une sous-categorie (ex: "j'ai un
   probleme", "ca marche pas", "aidez moi" sans aucun autre detail), ou si
   il est reellement ambigu entre au moins deux sous-categories tres
   differentes (ex: le mot "bloque" seul, sans dire si c'est la carte, le
   compte, ou l'application). false dans tous les autres cas, meme si le
   message est court mais suffisamment clair (ex: "carte perdue" suffit,
   pas besoin de clarification).

5. "question_clarification" : si "besoin_clarification" est true, UNE
   question courte et precise en francais pour aider le client a preciser
   son probleme (ex: "Pouvez-vous preciser : s'agit-il d'un probleme avec
   votre carte, un paiement, un distributeur, ou l'application mobile ?").
   Chaine vide "" si "besoin_clarification" est false.

REGLE IMPORTANTE : si le message concerne un credit/pret (immobilier, auto,
consommation), un litige de service client generique sans lien avec une
carte/un paiement precis, ou tout sujet SANS RAPPORT avec une carte
bancaire/un paiement/un DAB/une application, "sous_categorie" doit etre
"hors_sujet" MEME SI le mot "bloque" ou "compte" apparait dans le message.

CONTEXTE : l'utilisateur est deja dans le chatbot reclamations MONETIQUE de
la banque. Si le message mentionne vaguement "mon dossier", "ma reclamation",
"ma demande" SANS preciser un autre sujet (credit, pret, compte epargne...),
suppose PAR DEFAUT qu'il s'agit du suivi d'une reclamation monetique deja
en cours -> classe dans "Suivi de reclamation" (delai_traitement_contestation,
remboursement_en_attente, absence_reponse_service_client, ou
dossier_classe_sans_suite selon le cas), PAS "hors_sujet".

Si aucune sous-categorie ne correspond vraiment ET que le message n'est PAS
vague (c'est juste un sujet different), "sous_categorie" doit etre
"hors_sujet" et "besoin_clarification" false.

Reponds UNIQUEMENT avec ce JSON, rien d'autre :
{{"sous_categorie": "...", "problemes_secondaires": [], "resume_precis": "...", "besoin_clarification": false, "question_clarification": ""}}
"""


def est_une_demande_agent(texte: str) -> bool:
    texte_lower = texte.lower().strip()
    return any(mot in texte_lower for mot in MOTS_DEMANDE_AGENT)


def est_une_salutation(texte: str) -> bool:
    texte_nettoye = re.sub(r"[?!.,;:]", "", texte.lower().strip())
    if len(texte_nettoye.split()) <= 6:
        for mot in MOTS_SALUTATION:
            if re.search(rf"\b{re.escape(mot)}\b", texte_nettoye):
                return True
        for prefixe in PREFIXES_SALUTATION_DARIJA:
            if texte_nettoye.startswith(prefixe):
                return True
    return False


def contient_repetition_suspecte(texte: str, seuil: int = 3) -> bool:
    mots = texte.split()
    if len(mots) < seuil * 2:
        return False
    for taille_groupe in (1, 2, 3):
        for i in range(len(mots) - taille_groupe * seuil):
            groupe = mots[i:i + taille_groupe]
            repete = all(
                mots[i + k * taille_groupe:i + (k + 1) * taille_groupe] == groupe
                for k in range(seuil)
            )
            if repete:
                return True
    return False


def detecter_langue(texte: str) -> str:
    if re.search(r"[\u0600-\u06FF]", texte):
        return "arabe"
    if re.search(r"\b(mte3i|mte3|nchallah|barcha|3aychek|win|kifech|"
                 r"kifak|3la|3ala|ken|kher|jbedt|jewni)\b", texte.lower()):
        return "darija_latin"
    return "autre"


def traduire_darija_vers_francais(client_groq: Groq, texte: str) -> str:
    try:
        response = client_groq.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": (
                    "Traduis ce message ecrit en darija tunisien (ecriture "
                    "latine/arabizi, chiffres 3/7/9 pour des sons arabes) "
                    "vers un francais simple et clair. Traduis fidelement "
                    "le sens, sans rien ajouter ni inventer. Reponds "
                    "UNIQUEMENT avec la traduction, rien d'autre."
                )},
                {"role": "user", "content": texte},
            ],
            temperature=0,
            max_tokens=400,
            reasoning_effort="low",
        )
        traduction = response.choices[0].message.content.strip()
        if contient_repetition_suspecte(traduction) or len(traduction) < 3:
            return texte
        return traduction
    except Exception:
        return texte


def _appeler_classification(client_groq: Groq, texte_pour_classification: str,
                             contexte_precedent: Optional[str] = None) -> dict:
    contexte_txt = ""
    if contexte_precedent:
        contexte_txt = (
            f"\n\nCONTEXTE : le message precedent du client concernait la "
            f"sous-categorie '{contexte_precedent}'. Si le nouveau message "
            f"est une question de suivi/precision sur le meme sujet (ex: "
            f"'combien de temps ?', 'et apres ?', 'ok merci mais...') SANS "
            f"decrire un nouveau probleme, garde la meme sous-categorie "
            f"'{contexte_precedent}'."
        )

    response = client_groq.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": CLASSIFICATION_PROMPT},
            {"role": "user", "content": (
                f"Message : {texte_pour_classification}{contexte_txt}\n\n"
                'Reponds au format JSON demande, rien d\'autre.'
            )},
        ],
        response_format={"type": "json_object"},
        temperature=0,
        max_tokens=600,
        reasoning_effort="low",
    )
    contenu = response.choices[0].message.content
    parsed = json.loads(contenu)
    return parsed


def classifier_reclamation(client_groq: Groq, texte: str,
                            contexte_precedent: Optional[str] = None) -> dict:
    """Retourne un dict {sous_categorie, problemes_secondaires, resume_precis,
    besoin_clarification, question_clarification}. En cas d'echec total,
    retombe sur hors_sujet sans clarification (fallback deterministe)."""
    texte_pour_classification = texte
    if detecter_langue(texte) == "darija_latin":
        texte_pour_classification = traduire_darija_vers_francais(client_groq, texte)

    for _ in range(2):
        try:
            parsed = _appeler_classification(
                client_groq, texte_pour_classification, contexte_precedent
            )
            sous_categorie = parsed.get("sous_categorie")
            besoin_clarification = bool(parsed.get("besoin_clarification"))
            question_clarification = (parsed.get("question_clarification") or "").strip()

            if besoin_clarification and question_clarification:
                return {
                    "sous_categorie": "en_attente_clarification",
                    "problemes_secondaires": [],
                    "resume_precis": parsed.get("resume_precis") or "",
                    "besoin_clarification": True,
                    "question_clarification": question_clarification,
                }

            if sous_categorie in SOUS_CATEGORIES_VALIDES:
                problemes_secondaires = [
                    p for p in parsed.get("problemes_secondaires") or []
                    if p in SOUS_CATEGORIES_VALIDES and p != sous_categorie
                ]
                return {
                    "sous_categorie": sous_categorie,
                    "problemes_secondaires": problemes_secondaires,
                    "resume_precis": parsed.get("resume_precis") or "",
                    "besoin_clarification": False,
                    "question_clarification": "",
                }
        except Exception:
            pass

    return {
        "sous_categorie": "hors_sujet",
        "problemes_secondaires": [],
        "resume_precis": "",
        "besoin_clarification": False,
        "question_clarification": "",
    }


def _libelle_lisible(sous_categorie: str) -> str:
    """Transforme un code interne (ex: carte_perdue_volee) en libelle lisible
    pour l'affichage (ex: carte perdue volee), sans depende d'un mapping
    supplementaire a maintenir."""
    fiche = KNOWLEDGE_BASE.get(sous_categorie)
    if fiche and fiche.get("libelle"):
        return fiche["libelle"]
    return sous_categorie.replace("_", " ")


def construire_reponse_deterministe(sous_categorie: str, resume_precis: str = "",
                                     problemes_secondaires: Optional[list] = None) -> str:
    fiche = KNOWLEDGE_BASE.get(sous_categorie)

    # Ligne d'ouverture personnalisee : reprend ce que le client a vraiment
    # dit (montant, nombre de cartes, etc.) plutot qu'une phrase generique.
    if resume_precis:
        ligne_comprehension = f"Nous avons bien compris votre situation : {resume_precis}\n\n"
    else:
        ligne_comprehension = ""

    if fiche is None:
        base = (
            f"Bonjour,\n\n{ligne_comprehension}"
            "Nous avons bien recu votre reclamation. Elle ne correspond pas "
            "a une categorie automatisee precise, un conseiller va donc "
            "l'examiner personnellement et reviendra vers vous sous peu.\n\n"
            "Pour accelerer le traitement, merci de preciser si possible : "
            "la date, le montant concerne, et le type d'operation (carte, "
            "virement, paiement en ligne, retrait DAB...).\n\n"
            "L'equipe reclamations STB."
        )
    else:
        base = (
            f"Bonjour,\n\n{ligne_comprehension}"
            f"Nous avons bien pris en compte votre reclamation : {fiche['description']}\n\n"
            f"Delai de traitement estime : {fiche['delai_type']}\n\n"
            f"Ce que vous devez faire : {fiche['actions_client']}\n\n"
            f"De notre cote : {fiche['actions_banque']}\n\n"
            "L'equipe reclamations STB."
        )

    # Si le client a mentionne d'autres problemes dans le meme message, on
    # le confirme explicitement plutot que de les ignorer silencieusement.
    if problemes_secondaires:
        libelles = ", ".join(_libelle_lisible(p) for p in problemes_secondaires)
        base += (
            f"\n\nNous avons egalement note que vous mentionnez : {libelles}. "
            "Ce point sera traite en parallele ; n'hesitez pas a m'en dire "
            "plus sur ce second sujet si vous le souhaitez."
        )

    return base


def traduire_avec_validation(client_groq: Groq, texte_francais: str, langue_cible: str) -> str:
    if langue_cible != "arabe":
        return texte_francais
    try:
        response = client_groq.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": (
                    "Traduis le texte suivant en arabe standard simple. "
                    "Traduis fidelement, sans rien ajouter ni inventer. "
                    "Ne repete jamais un mot plusieurs fois de suite."
                )},
                {"role": "user", "content": texte_francais},
            ],
            temperature=0,
            max_tokens=800,
            reasoning_effort="low",
        )
        traduction = response.choices[0].message.content
        if contient_repetition_suspecte(traduction):
            return texte_francais
        return traduction
    except Exception:
        return texte_francais


def generer_reponse(client_groq: Groq, texte_client: str, sous_categorie: str,
                     resume_precis: str = "", problemes_secondaires: Optional[list] = None) -> str:
    reponse_fr = construire_reponse_deterministe(sous_categorie, resume_precis, problemes_secondaires)
    langue = detecter_langue(texte_client)
    return traduire_avec_validation(client_groq, reponse_fr, langue)


def transcrire_audio(client_groq: Groq, audio_bytes: bytes, nom_fichier: str = "reclamation.webm") -> str:
    fichier_audio = io.BytesIO(audio_bytes)
    fichier_audio.name = nom_fichier
    transcription = client_groq.audio.transcriptions.create(
        file=fichier_audio,
        model="whisper-large-v3",
        response_format="text",
    )
    return str(transcription).strip()


def synthetiser_voix(texte: str, langue_cible: str) -> Optional[bytes]:
    code_langue = "ar" if langue_cible == "arabe" else "fr"
    try:
        tampon = io.BytesIO()
        gTTS(text=texte, lang=code_langue, slow=False).write_to_fp(tampon)
        tampon.seek(0)
        return tampon.read()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# API FastAPI
# ---------------------------------------------------------------------------

app = FastAPI(title="STB Chatbot Reclamations Monetique - API interne")

app.add_middleware(
    CORSMiddleware,
    # Uniquement le backend Node doit appeler ce service. On garde une
    # origine configurable plutot que "*" par prudence.
    allow_origins=[os.environ.get("ALLOWED_ORIGIN", "http://localhost:4000")],
    allow_methods=["*"],
    allow_headers=["*"],
)

_client_groq: Optional[Groq] = None


def get_client_groq() -> Groq:
    global _client_groq
    if _client_groq is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="GROQ_API_KEY manquante cote serveur.")
        _client_groq = Groq(api_key=api_key)
    return _client_groq


class MessageIn(BaseModel):
    texte: str
    contexte_precedent: Optional[str] = None


class MessageOut(BaseModel):
    reponse: str
    sous_categorie: str
    est_salutation: bool = False
    resume_precis: str = ""
    problemes_secondaires: list[str] = []
    besoin_clarification: bool = False


class AudioIn(BaseModel):
    audio_base64: str
    nom_fichier: Optional[str] = "reclamation.webm"


class TranscriptionOut(BaseModel):
    texte: str


class ParlerIn(BaseModel):
    texte: str
    langue: str = "francais"


@app.get("/health")
def health():
    return {"status": "ok", "service": "stb-chatbot-api"}


@app.post("/repondre", response_model=MessageOut)
def repondre(payload: MessageIn):
    texte = (payload.texte or "").strip()
    if not texte:
        raise HTTPException(status_code=400, detail="Message vide.")

    if est_une_demande_agent(texte):
        return MessageOut(
            reponse=REPONSE_DEMANDE_AGENT,
            sous_categorie=payload.contexte_precedent or "demande_agent",
        )

    if est_une_salutation(texte):
        return MessageOut(reponse=REPONSE_SALUTATION, sous_categorie="salutation", est_salutation=True)

    client = get_client_groq()
    resultat = classifier_reclamation(client, texte, payload.contexte_precedent)
    sous_categorie = resultat["sous_categorie"]

    if resultat.get("besoin_clarification"):
        # Le message est trop vague : on pose une question de precision
        # plutot que de deviner une procedure au hasard. On garde le
        # contexte_precedent tel quel (pas de nouvelle categorie tranchee),
        # pour que le message suivant du client soit interprete a la lumiere
        # de cette meme demande.
        question = resultat.get("question_clarification") or (
            "Pouvez-vous preciser votre probleme (carte, paiement, "
            "distributeur, application...) ?"
        )
        langue = detecter_langue(texte)
        reponse = traduire_avec_validation(client, question, langue)
        return MessageOut(
            reponse=reponse,
            sous_categorie=payload.contexte_precedent or "hors_sujet",
            besoin_clarification=True,
        )

    reponse = generer_reponse(
        client, texte, sous_categorie,
        resume_precis=resultat.get("resume_precis", ""),
        problemes_secondaires=resultat.get("problemes_secondaires", []),
    )
    return MessageOut(
        reponse=reponse,
        sous_categorie=sous_categorie,
        resume_precis=resultat.get("resume_precis", ""),
        problemes_secondaires=resultat.get("problemes_secondaires", []),
    )


@app.post("/transcrire", response_model=TranscriptionOut)
def transcrire(payload: AudioIn):
    try:
        audio_bytes = base64.b64decode(payload.audio_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Audio invalide (base64 attendu).")

    client = get_client_groq()
    try:
        texte = transcrire_audio(client, audio_bytes, payload.nom_fichier or "reclamation.webm")
    except Exception:
        raise HTTPException(status_code=502, detail="Impossible de transcrire l'audio.")

    if not texte:
        raise HTTPException(status_code=422, detail="Aucune parole detectee dans l'audio.")

    return TranscriptionOut(texte=texte)


@app.post("/parler")
def parler(payload: ParlerIn):
    texte = (payload.texte or "").strip()
    if not texte:
        raise HTTPException(status_code=400, detail="Texte vide.")

    audio_bytes = synthetiser_voix(texte, payload.langue)
    if audio_bytes is None:
        raise HTTPException(status_code=502, detail="Impossible de generer l'audio.")

    return Response(content=audio_bytes, media_type="audio/mpeg")
