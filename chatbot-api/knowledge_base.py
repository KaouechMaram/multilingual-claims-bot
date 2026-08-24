# -*- coding: utf-8 -*-
"""
Base de connaissances (Knowledge Base) pour le systeme RAG du chatbot
reclamations monetique STB.

!!! IMPORTANT !!!
Ces 54 fiches sont des MODELES bases sur des pratiques bancaires standards,
PAS les vraies procedures internes de la STB. Avant mise en production,
CHAQUE fiche doit etre relue et remplacee/validee par le service
reclamations reel de la banque (delais exacts, montants de frais reels,
canaux de contact reels, references reglementaires BCT applicables).

Structure de chaque fiche :
    - description  : explication du cas
    - delai_type    : delai de traitement standard
    - actions_client : ce que le client doit faire
    - actions_banque : ce que fait la banque en interne
    - reference     : reference procedure interne (a completer par la STB)
"""

KNOWLEDGE_BASE = {
    # === 1. Carte bancaire physique ===
    "carte_perdue_volee": {
        "description": "Le client a perdu sa carte ou se l'est fait voler. Il faut la mettre immediatement en opposition pour eviter toute utilisation frauduleuse.",
        "delai_type": "Opposition immediate (moins de 5 minutes). Nouvelle carte sous 5 a 7 jours ouvres.",
        "actions_client": "Contacter le centre d'appel ou l'agence pour faire opposition. Deposer une declaration de perte/vol si necessaire.",
        "actions_banque": "Bloquer la carte immediatement dans le systeme. Commander une nouvelle carte. Verifier les transactions recentes pour detecter une fraude.",
        "reference": "PROC-CARTE-01",
    },
    "carte_avalee_dab": {
        "description": "Le distributeur automatique a retenu la carte du client (souvent suite a une erreur de code ou une panne).",
        "delai_type": "Recuperation possible sous 24-48h aupres de l'agence gestionnaire du DAB, sinon nouvelle carte sous 5-7 jours.",
        "actions_client": "Se presenter a l'agence la plus proche du DAB concerne avec une piece d'identite.",
        "actions_banque": "Verifier si la carte a ete recuperee par le service maintenance du DAB. Si perdue, la detruire et en emettre une nouvelle.",
        "reference": "PROC-CARTE-02",
    },
    "carte_non_recue": {
        "description": "Le client n'a jamais recu sa nouvelle carte malgre une demande ou un renouvellement.",
        "delai_type": "Verification sous 48h, reemission si necessaire sous 5-7 jours.",
        "actions_client": "Confirmer l'adresse de livraison enregistree, patienter le delai standard avant reclamation.",
        "actions_banque": "Verifier le statut d'expedition. Si perdue en cours de livraison, annuler l'ancienne carte et en emettre une nouvelle.",
        "reference": "PROC-CARTE-03",
    },
    "carte_expiree": {
        "description": "La carte du client a atteint sa date d'expiration sans que la nouvelle carte soit encore disponible.",
        "delai_type": "Renouvellement automatique normalement envoye 1 mois avant expiration. Si manquant, nouvelle carte sous 5-7 jours.",
        "actions_client": "Verifier que ses coordonnees sont a jour dans le systeme bancaire.",
        "actions_banque": "Emettre une carte de remplacement en priorite si le renouvellement automatique a echoue.",
        "reference": "PROC-CARTE-04",
    },
    "activation_carte": {
        "description": "Le client rencontre une difficulte a activer sa nouvelle carte (via DAB, appli ou centre d'appel).",
        "delai_type": "Activation immediate en agence ou via centre d'appel apres verification d'identite.",
        "actions_client": "Se munir de sa piece d'identite et du numero de carte pour l'activation assistee.",
        "actions_banque": "Verifier que la carte est bien enregistree dans le systeme et proceder a l'activation manuelle si besoin.",
        "reference": "PROC-CARTE-05",
    },
    "carte_defectueuse": {
        "description": "La carte presente un defaut physique (puce endommagee, piste magnetique illisible, carte fissuree).",
        "delai_type": "Remplacement sous 5-7 jours ouvres, gratuit si defaut de fabrication.",
        "actions_client": "Rapporter la carte defectueuse en agence pour verification.",
        "actions_banque": "Constater le defaut, emettre une carte de remplacement sans frais.",
        "reference": "PROC-CARTE-06",
    },
    "renouvellement_anticipe": {
        "description": "Le client demande le renouvellement de sa carte avant l'echeance normale (depart a l'etranger, carte endommagee prevue, etc.).",
        "delai_type": "Sous 5-7 jours ouvres apres validation de la demande.",
        "actions_client": "Formuler la demande en agence ou via l'application avec justification si besoin.",
        "actions_banque": "Valider la demande et emettre la nouvelle carte en desactivant l'ancienne a reception.",
        "reference": "PROC-CARTE-07",
    },

    # === 2. Blocage et securite ===
    "carte_bloquee": {
        "description": "La carte du client est bloquee, generalement suite a une erreur de code repetee ou une mesure de securite.",
        "delai_type": "Deblocage possible sous 24h apres verification d'identite.",
        "actions_client": "Contacter le centre d'appel ou se presenter en agence avec piece d'identite.",
        "actions_banque": "Verifier la raison du blocage, debloquer si aucune anomalie confirmee.",
        "reference": "PROC-SEC-01",
    },
    "code_pin_oublie": {
        "description": "Le client a oublie le code confidentiel de sa carte.",
        "delai_type": "Nouveau code genere sous 3-5 jours ouvres (courrier securise) ou immediat en agence selon le canal.",
        "actions_client": "Demander la reinitialisation en agence avec piece d'identite ou via le centre d'appel.",
        "actions_banque": "Generer un nouveau code PIN et le transmettre de maniere securisee.",
        "reference": "PROC-SEC-02",
    },
    "code_pin_bloque": {
        "description": "Le code PIN a ete bloque suite a 3 tentatives erronees consecutives.",
        "delai_type": "Deblocage immediat en agence, ou nouveau code sous 3-5 jours si reinitialisation necessaire.",
        "actions_client": "Se presenter en agence avec piece d'identite pour deblocage ou reinitialisation.",
        "actions_banque": "Verifier l'identite, debloquer le code existant ou en generer un nouveau.",
        "reference": "PROC-SEC-03",
    },
    "opposition_carte": {
        "description": "Le client demande explicitement la mise en opposition de sa carte (perte, vol, ou precaution).",
        "delai_type": "Opposition immediate, effective en moins de 5 minutes.",
        "actions_client": "Appeler le centre d'appel opposition (disponible 24h/24) ou utiliser l'application.",
        "actions_banque": "Bloquer immediatement la carte dans le systeme monetique, confirmer par SMS/email.",
        "reference": "PROC-SEC-04",
    },
    "blocage_soupcon_fraude": {
        "description": "La banque a bloque la carte de sa propre initiative suite a une activite jugee suspecte (transactions inhabituelles, localisation atypique).",
        "delai_type": "Verification et deblocage (si non-fraude confirme) sous 24-48h.",
        "actions_client": "Confirmer ou infirmer les transactions suspectes aupres du service securite.",
        "actions_banque": "Analyser les transactions signalees, debloquer si le client confirme leur legitimite, sinon maintenir le blocage et lancer une procedure de fraude.",
        "reference": "PROC-SEC-05",
    },

    # === 3. Distributeur automatique (DAB/GAB) ===
    "dab_hors_service": {
        "description": "Le distributeur automatique consulte par le client est hors service ou en panne.",
        "delai_type": "Signalement transmis a la maintenance sous 24h, reparation variable selon la panne.",
        "actions_client": "Signaler le DAB en panne via l'application ou le centre d'appel, se rendre a un autre DAB.",
        "actions_banque": "Transmettre le signalement au service technique/maintenance des automates.",
        "reference": "PROC-DAB-01",
    },
    "retrait_non_delivre_debite": {
        "description": "Le compte du client a ete debite pour un retrait au DAB, mais l'argent n'a pas ete distribue par la machine.",
        "delai_type": "Recreditement sous 3-5 jours ouvres apres verification du journal de caisse du DAB.",
        "actions_client": "Signaler l'incident avec la date, l'heure et le montant exact de la transaction.",
        "actions_banque": "Verifier le journal de caisse (cash register log) du DAB concerne, recrediter automatiquement si l'anomalie est confirmee.",
        "reference": "PROC-DAB-02",
    },
    "retrait_partiel": {
        "description": "Le DAB n'a delivre qu'une partie du montant demande par le client.",
        "delai_type": "Verification et regularisation sous 3-5 jours ouvres.",
        "actions_client": "Signaler le montant exact recu vs demande.",
        "actions_banque": "Verifier le journal de caisse du DAB et recrediter la difference si confirmee.",
        "reference": "PROC-DAB-03",
    },
    "billets_defectueux": {
        "description": "Le client a recu des billets endommages, dechires ou illisibles depuis un DAB.",
        "delai_type": "Echange possible en agence sous 48h.",
        "actions_client": "Se presenter en agence avec les billets concernes.",
        "actions_banque": "Echanger les billets defectueux, signaler l'incident pour maintenance du DAB si recurrent.",
        "reference": "PROC-DAB-04",
    },

    # === 4. Paiement en point de vente (TPE) ===
    "paiement_refuse": {
        "description": "Le paiement du client a ete refuse par le terminal de paiement du commercant alors que le solde semble suffisant.",
        "delai_type": "Verification immediate possible via le centre d'appel.",
        "actions_client": "Verifier le solde disponible et le plafond de paiement restant, contacter le centre d'appel si le refus persiste.",
        "actions_banque": "Verifier les causes possibles (plafond atteint, carte bloquee, probleme reseau) et informer le client.",
        "reference": "PROC-TPE-01",
    },
    "double_debit": {
        "description": "Le client a ete debite deux fois pour un seul et meme achat.",
        "delai_type": "Annulation de la transaction en double et recreditement sous 3-5 jours ouvres.",
        "actions_client": "Fournir le ticket de caisse et les references des deux transactions.",
        "actions_banque": "Verifier aupres de l'acquereur commercant, annuler le doublon et recrediter le client.",
        "reference": "PROC-TPE-02",
    },
    "montant_errone": {
        "description": "Le montant debite ne correspond pas au montant reel de l'achat effectue.",
        "delai_type": "Correction sous 5-7 jours ouvres apres verification aupres du commercant.",
        "actions_client": "Fournir le ticket de caisse comme preuve du montant reel.",
        "actions_banque": "Contacter le commercant pour verification, ajuster/rembourser la difference si l'erreur est confirmee.",
        "reference": "PROC-TPE-03",
    },
    "tpe_en_panne": {
        "description": "Le terminal de paiement electronique du commercant est en panne, empechant le paiement par carte.",
        "delai_type": "Pas d'action bancaire directe necessaire, information au client sur les alternatives.",
        "actions_client": "Utiliser un autre moyen de paiement ou se rendre chez un autre commercant/DAB.",
        "actions_banque": "Informer le client, transmettre le signalement au reseau monetique si le probleme est recurrent chez ce commercant.",
        "reference": "PROC-TPE-04",
    },
    "paiement_sans_contact": {
        "description": "La fonction de paiement sans contact de la carte du client ne fonctionne plus.",
        "delai_type": "Diagnostic sous 48h, remplacement de carte si defaut confirme sous 5-7 jours.",
        "actions_client": "Tester le sans-contact sur plusieurs TPE differents pour confirmer le probleme.",
        "actions_banque": "Verifier a distance l'activation de la fonction, emettre une nouvelle carte si defaut materiel confirme.",
        "reference": "PROC-TPE-05",
    },
    "litige_commercant": {
        "description": "Litige entre le client et un commercant (produit non livre, defectueux, ou refus de remboursement) concernant un paiement par carte.",
        "delai_type": "Procedure de contestation (chargeback) sous 10 a 45 jours selon le reseau (Visa/Mastercard).",
        "actions_client": "Fournir toutes les preuves du litige (echanges avec le commercant, preuve de non-livraison, etc.).",
        "actions_banque": "Lancer la procedure de contestation aupres du reseau monetique (chargeback), informer le client de l'avancement.",
        "reference": "PROC-TPE-06",
    },

    # === 5. Paiement en ligne / e-commerce ===
    "paiement_ligne_refuse": {
        "description": "Le paiement en ligne du client via sa carte a ete refuse par le site marchand.",
        "delai_type": "Verification immediate possible.",
        "actions_client": "Verifier que le 3D-Secure/OTP a bien ete valide, verifier le plafond de paiement en ligne.",
        "actions_banque": "Verifier les causes du refus (plafond, 3D-Secure, blocage) et guider le client.",
        "reference": "PROC-ECOM-01",
    },
    "transaction_non_reconnue": {
        "description": "Le client constate une transaction sur son compte qu'il ne reconnait pas.",
        "delai_type": "Investigation sous 5-10 jours ouvres.",
        "actions_client": "Signaler immediatement la transaction avec date, montant et beneficiaire si connu.",
        "actions_banque": "Ouvrir une enquete, bloquer la carte par precaution si necessaire, rembourser si fraude confirmee.",
        "reference": "PROC-ECOM-02",
    },
    "remboursement_ligne_absent": {
        "description": "Le client n'a pas recu le remboursement promis par un site marchand suite a une commande annulee ou retournee.",
        "delai_type": "Verification sous 10-15 jours ouvres (delai bancaire standard pour un remboursement e-commerce).",
        "actions_client": "Fournir la preuve d'annulation/retour et la confirmation du commercant si disponible.",
        "actions_banque": "Verifier si le remboursement a ete initie par le commercant, lancer une contestation si le delai est depasse.",
        "reference": "PROC-ECOM-03",
    },
    "abonnement_non_annule": {
        "description": "Le client continue d'etre preleve pour un abonnement en ligne qu'il pensait avoir resilie.",
        "delai_type": "Blocage des futurs prelevements immediat, remboursement du dernier prelevement sous 5-10 jours si applicable.",
        "actions_client": "Fournir la preuve de resiliation aupres du prestataire si disponible.",
        "actions_banque": "Bloquer les prelevements futurs de ce commercant sur demande du client (opposition prelevement).",
        "reference": "PROC-ECOM-04",
    },

    # === 6. Plafonds ===
    "plafond_retrait": {
        "description": "Le client estime que son plafond de retrait est insuffisant pour ses besoins.",
        "delai_type": "Modification sous 24-48h apres validation.",
        "actions_client": "Formuler une demande d'augmentation en agence ou via l'application.",
        "actions_banque": "Valider la demande selon le profil client et ajuster le plafond dans le systeme.",
        "reference": "PROC-PLAF-01",
    },
    "plafond_paiement": {
        "description": "Le client estime que son plafond de paiement est insuffisant pour ses besoins.",
        "delai_type": "Modification sous 24-48h apres validation.",
        "actions_client": "Formuler une demande d'augmentation en agence ou via l'application.",
        "actions_banque": "Valider la demande selon le profil client et ajuster le plafond dans le systeme.",
        "reference": "PROC-PLAF-02",
    },
    "modification_plafond_non_traitee": {
        "description": "Une demande de modification de plafond formulee par le client n'a pas ete traitee dans le delai attendu.",
        "delai_type": "Traitement prioritaire sous 48h a compter du signalement.",
        "actions_client": "Fournir la date et le canal de la demande initiale.",
        "actions_banque": "Verifier si la demande a bien ete enregistree, la traiter en priorite si oubliee.",
        "reference": "PROC-PLAF-03",
    },
    "plafond_incoherent": {
        "description": "Le plafond affiche sur l'application ne correspond pas au plafond reellement applique lors des transactions.",
        "delai_type": "Correction sous 48-72h apres verification technique.",
        "actions_client": "Signaler l'ecart constate avec capture d'ecran si possible.",
        "actions_banque": "Verifier la synchronisation entre le systeme monetique et l'application, corriger l'anomalie.",
        "reference": "PROC-PLAF-04",
    },

    # === 7. Carte virtuelle / e-carte ===
    "generation_ecarte_impossible": {
        "description": "Le client ne parvient pas a generer une carte virtuelle depuis l'application.",
        "delai_type": "Diagnostic et resolution sous 48h.",
        "actions_client": "Verifier que son compte est eligible au service e-carte, reessayer apres mise a jour de l'application.",
        "actions_banque": "Verifier l'eligibilite du compte et le bon fonctionnement du module e-carte.",
        "reference": "PROC-ECARTE-01",
    },
    "ecarte_non_fonctionnelle": {
        "description": "La carte virtuelle generee est rejetee lors des paiements en ligne.",
        "delai_type": "Diagnostic sous 48h, regeneration si necessaire.",
        "actions_client": "Verifier la date d'expiration et le montant charge sur l'e-carte.",
        "actions_banque": "Verifier l'activation de l'e-carte dans le systeme monetique, la regenerer si besoin.",
        "reference": "PROC-ECARTE-02",
    },
    "montant_ecarte_incorrect": {
        "description": "Le montant charge sur la carte virtuelle ne correspond pas au montant demande par le client.",
        "delai_type": "Correction sous 24-48h.",
        "actions_client": "Indiquer le montant demande vs le montant constate.",
        "actions_banque": "Verifier la transaction de chargement et corriger l'ecart.",
        "reference": "PROC-ECARTE-03",
    },
    "expiration_ecarte": {
        "description": "La carte virtuelle expire plus rapidement que prevu ou avant meme sa premiere utilisation.",
        "delai_type": "Regeneration immediate possible via l'application.",
        "actions_client": "Generer une nouvelle e-carte si l'ancienne est expiree.",
        "actions_banque": "Verifier la duree de validite parametree pour ce type d'e-carte, corriger si anomalie systeme.",
        "reference": "PROC-ECARTE-04",
    },

    # === 8. Frais et tarification monetique ===
    "cotisation_carte_contestee": {
        "description": "Le client conteste des frais de cotisation annuelle preleves sur sa carte.",
        "delai_type": "Verification sous 5-7 jours ouvres.",
        "actions_client": "Preciser la date et le montant du prelevement conteste.",
        "actions_banque": "Verifier la grille tarifaire applicable au contrat du client, rembourser si erreur de facturation confirmee.",
        "reference": "PROC-FRAIS-01",
    },
    "frais_retrait_contestes": {
        "description": "Le client conteste des frais preleves lors d'un retrait au DAB.",
        "delai_type": "Verification sous 5-7 jours ouvres.",
        "actions_client": "Preciser la date, le montant et le DAB concerne.",
        "actions_banque": "Verifier la grille tarifaire (DAB de la banque vs DAB confrere), rembourser si erreur confirmee.",
        "reference": "PROC-FRAIS-02",
    },
    "frais_retrait_etranger": {
        "description": "Le client conteste des frais qu'il juge excessifs sur un retrait effectue a l'etranger.",
        "delai_type": "Verification sous 5-7 jours ouvres.",
        "actions_client": "Preciser la date, le pays et le montant du retrait concerne.",
        "actions_banque": "Verifier la grille tarifaire internationale applicable, expliquer le detail des frais (commission + taux de change).",
        "reference": "PROC-FRAIS-03",
    },
    "frais_opposition_contestes": {
        "description": "Le client conteste des frais factures pour la mise en opposition de sa carte.",
        "delai_type": "Verification sous 5-7 jours ouvres.",
        "actions_client": "Preciser le contexte de l'opposition (perte, vol, fraude).",
        "actions_banque": "Verifier si des frais d'opposition s'appliquent selon le motif (generalement gratuit en cas de vol/fraude averee).",
        "reference": "PROC-FRAIS-04",
    },

    # === 9. International / devises ===
    "carte_refusee_etranger": {
        "description": "La carte du client est refusee a l'etranger alors qu'elle fonctionne normalement en Tunisie.",
        "delai_type": "Activation de l'option internationale sous 24-48h si necessaire.",
        "actions_client": "Verifier que l'option paiement/retrait international est activee sur sa carte.",
        "actions_banque": "Activer l'option internationale si non deja active, verifier les plafonds specifiques a l'international.",
        "reference": "PROC-INTL-01",
    },
    "taux_change_conteste": {
        "description": "Le client conteste le taux de change applique lors d'un paiement ou retrait en devises etrangeres.",
        "delai_type": "Explication et verification sous 5-7 jours ouvres.",
        "actions_client": "Fournir la date et le montant exact de la transaction en devises.",
        "actions_banque": "Verifier le taux de change applique (taux du jour BCT + marge reseau) et expliquer le detail au client.",
        "reference": "PROC-INTL-02",
    },
    "retrait_etranger_indisponible": {
        "description": "Le client n'a pas pu retirer d'argent avec sa carte lors d'un sejour a l'etranger.",
        "delai_type": "Diagnostic sous 48-72h.",
        "actions_client": "Preciser le pays, la date et la banque du DAB concerne.",
        "actions_banque": "Verifier l'activation de l'option retrait international et les plafonds applicables a l'etranger.",
        "reference": "PROC-INTL-03",
    },

    # === 10. Fraude et securite monetique ===
    "fraude_carte_presente": {
        "description": "Des transactions frauduleuses ont ete effectuees en utilisant une copie physique de la carte du client (carte presente).",
        "delai_type": "Blocage immediat, remboursement sous 5-10 jours ouvres apres enquete.",
        "actions_client": "Signaler immediatement, deposer une plainte si necessaire, fournir la liste des transactions non reconnues.",
        "actions_banque": "Bloquer la carte immediatement, ouvrir une enquete fraude, rembourser le client selon la politique de garantie fraude.",
        "reference": "PROC-FRAUDE-01",
    },
    "fraude_carte_absente": {
        "description": "Des transactions frauduleuses ont ete effectuees en ligne en utilisant les donnees de la carte du client, sans la carte physique.",
        "delai_type": "Blocage immediat, remboursement sous 5-10 jours ouvres apres enquete.",
        "actions_client": "Signaler immediatement, changer ses identifiants en ligne si compromis.",
        "actions_banque": "Bloquer la carte, ouvrir une enquete fraude, rembourser selon la politique de garantie.",
        "reference": "PROC-FRAUDE-02",
    },
    "clonage_carte": {
        "description": "Le client suspecte que sa carte a ete clonee (skimming) suite a des transactions inconnues.",
        "delai_type": "Blocage immediat, nouvelle carte sous 5-7 jours, remboursement sous 5-10 jours ouvres.",
        "actions_client": "Signaler immediatement, eviter d'utiliser des DAB isoles/suspects a l'avenir.",
        "actions_banque": "Bloquer la carte, emettre une nouvelle carte avec nouveau numero, ouvrir une enquete fraude.",
        "reference": "PROC-FRAUDE-03",
    },
    "phishing_debit": {
        "description": "Le client a ete victime d'un SMS ou email frauduleux (phishing) ayant conduit a un debit non autorise.",
        "delai_type": "Blocage immediat, remboursement sous 5-10 jours ouvres selon enquete.",
        "actions_client": "Ne jamais communiquer son code confidentiel ou OTP, signaler immediatement le message frauduleux.",
        "actions_banque": "Bloquer la carte/les acces compromis, ouvrir une enquete, sensibiliser le client, rembourser si eligible.",
        "reference": "PROC-FRAUDE-04",
    },

    # === 11. Suivi de reclamation ===
    "delai_traitement_contestation": {
        "description": "Le client trouve que le traitement de sa contestation prend plus de temps que prevu.",
        "delai_type": "Delai standard de contestation 5 a 45 jours selon le type (chargeback reseau vs erreur interne).",
        "actions_client": "Fournir le numero de dossier de la reclamation initiale.",
        "actions_banque": "Verifier le statut du dossier, informer le client du delai restant estime.",
        "reference": "PROC-SUIVI-01",
    },
    "remboursement_en_attente": {
        "description": "Le client attend un remboursement promis qui n'est toujours pas arrive sur son compte.",
        "delai_type": "Verification et regularisation sous 3-5 jours ouvres.",
        "actions_client": "Fournir le numero de dossier et la date promise du remboursement.",
        "actions_banque": "Verifier le statut du virement de remboursement, regulariser si retard confirme.",
        "reference": "PROC-SUIVI-02",
    },
    "absence_reponse_service_client": {
        "description": "Le client n'a recu aucune reponse du service client malgre plusieurs tentatives de contact.",
        "delai_type": "Reponse garantie sous 48h apres escalade.",
        "actions_client": "Fournir les dates et canaux des tentatives de contact precedentes.",
        "actions_banque": "Escalader la demande au responsable du service concerne, garantir une reponse sous 48h.",
        "reference": "PROC-SUIVI-03",
    },
    "dossier_classe_sans_suite": {
        "description": "Le dossier de reclamation du client a ete ferme sans resolution ni explication.",
        "delai_type": "Reouverture et traitement prioritaire sous 5 jours ouvres.",
        "actions_client": "Fournir le numero de dossier concerne.",
        "actions_banque": "Reouvrir le dossier, identifier la cause de la fermeture prematuree, traiter en priorite.",
        "reference": "PROC-SUIVI-04",
    },

    # === 12. Problemes techniques application ===
    "app_crash_bug": {
        "description": "L'application mobile bancaire plante ou presente des bugs empechant son utilisation normale.",
        "delai_type": "Correction selon cycle de mise a jour (generalement sous 2-4 semaines pour un bug non critique).",
        "actions_client": "Mettre a jour l'application vers la derniere version, redemarrer le telephone, reinstaller si necessaire.",
        "actions_banque": "Transmettre le signalement a l'equipe technique/DSI pour diagnostic et correction.",
        "reference": "PROC-TECH-01",
    },
    "app_lente": {
        "description": "L'application mobile bancaire est anormalement lente lors de son utilisation.",
        "delai_type": "Optimisation selon cycle de mise a jour.",
        "actions_client": "Verifier sa connexion internet, vider le cache de l'application, mettre a jour vers la derniere version.",
        "actions_banque": "Transmettre le signalement de performance a l'equipe technique pour investigation.",
        "reference": "PROC-TECH-02",
    },
    "probleme_connexion_authentification": {
        "description": "Le client ne parvient pas a se connecter a l'application (identifiants, biometrie, ou code d'acces).",
        "delai_type": "Reinitialisation possible immediatement en agence ou via centre d'appel.",
        "actions_client": "Se presenter en agence avec piece d'identite pour reinitialiser ses identifiants.",
        "actions_banque": "Verifier l'identite, reinitialiser les identifiants d'acces a l'application.",
        "reference": "PROC-TECH-03",
    },
    "probleme_mise_a_jour": {
        "description": "Une mise a jour recente de l'application a introduit des dysfonctionnements.",
        "delai_type": "Correctif publie generalement sous 1-2 semaines.",
        "actions_client": "Signaler les fonctionnalites impactees precisement.",
        "actions_banque": "Transmettre a l'equipe technique, publier un correctif si un bug de regression est confirme.",
        "reference": "PROC-TECH-04",
    },
    "fonctionnalite_manquante": {
        "description": "Le client signale l'absence d'une fonctionnalite qu'il attendrait de l'application (ex: virement instantane, telechargement de releve).",
        "delai_type": "Evaluee au cas par cas dans la feuille de route produit, pas de delai garanti.",
        "actions_client": "Decrire precisement la fonctionnalite souhaitee.",
        "actions_banque": "Transmettre au service produit/digital pour evaluation d'ajout dans une prochaine version.",
        "reference": "PROC-TECH-05",
    },
}
