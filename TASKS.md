# Chinese Learning OS — Tâches d'implémentation

Claude :

Utilise ce document comme source de vérité pour l'avancement.

Travaille séquentiellement.

Modifier :

- [ ] → [x]

UNIQUEMENT lorsqu'une tâche est :

- implémentée ;
- testée ;
- vérifiée.

Si de nouvelles tâches nécessaires apparaissent :

les ajouter à ce document.

Ne pas cocher artificiellement des tâches futures.

---

# PHASE 0 — Comprendre les vrais cours

- [x] Inspecter tous les PDF dans source-materials/pdf/
- [x] Identifier les différents formats
- [x] Identifier les structures récurrentes
- [x] Identifier les tableaux
- [x] Identifier le format du vocabulaire
- [x] Identifier le format du pinyin
- [x] Identifier les corrections
- [x] Identifier les exercices
- [x] Identifier les cas difficiles
- [x] Créer docs/PDF_ANALYSIS.md
- [x] Choisir une stratégie d'extraction PDF
- [x] Tester cette stratégie sur plusieurs PDF

---

# PHASE 0 bis — Tâches ajoutées en cours de route

- [x] Fournisseur IA sur l'abonnement Claude (CLI `claude -p`, sans clé API) + option API Anthropic
- [x] Extraction heuristique sans IA (repli si l'IA est absente ou échoue)
- [x] Normalisation des radicaux Unicode (⾏ → 行) dans le texte extrait
- [x] Provenance distincte pour la traduction des exemples (jamais attribuée à tort à la professeure)
- [x] PDF synthétiques de test (notes FR, tableau FR, scan, corrompu)
- [x] Documenter l'algorithme (docs/SPACED_REPETITION.md) et les décisions (docs/DECISIONS.md)
- [x] Session interrompue reprise (session quotidienne uniquement)
- [x] Révision anticipée : pas de saut d'intervalle juste après une 1re réussite
- [x] Second PDF réel (« 聊天 », notes de conversation) analysé, importeur adapté (gloses collées, natures grammaticales)
- [x] Audit d'accessibilité axe (WCAG 2 A/AA) intégré aux tests E2E
- [x] Voix naturelle Google Chirp 3 HD (clé serveur, cache disque, pré-génération, choix de la voix, repli navigateur)
- [x] Correction : création concurrente de plusieurs utilisateurs au premier chargement
- [x] Voix Microsoft Edge par défaut (msedge-tts, sans compte), vérifiée avec le vrai service dans le navigateur
- [x] Correction : erreur « nécessite une connexion internet » dans Brave → transcription locale Whisper (repli automatique), vérifiée dans le navigateur avec un vrai enregistrement
- [x] Thèmes transversaux alimentés automatiquement par l'IA à chaque cours (page Thèmes, fiche thème, révision d'un thème, rangement manuel, fusion, suppression sans perte), vérifiés avec la vraie IA sur la base réelle
- [x] Correction : un PDF choisi avant le chargement complet de la page d'import était ignoré
- [x] Ressources externes, étape 1 : texte collé, lien d'article, fichier (PDF, Word, texte, sous-titres) → tri des mots (connus / utiles / rares, taux de mots connus, niveau HSK), validation avec provenance « Ressource », révision, thèmes ; vérifiées avec la vraie IA sur un article réel
- [x] Ressources, étape 2 : vidéos YouTube (sous-titres de l'auteur ou automatiques, sinon transcription Whisper via yt-dlp + ffmpeg), lecteur interactif synchronisé, « ▶ » par mot ; vérifiées sur de vraies vidéos (sous-titres et Whisper) avec la vraie IA
- [x] Rythme quotidien : plafond de nouvelles notions par jour (10, réglable), « Journée validée » avec la charge de demain sur l'accueil, la page Réviser et la fin de session, bouton « révisions seulement » ; tests unitaires, intégration et E2E
- [x] Arrêt conseillé en cours de session (réponses qui se dégradent, durée largement dépassée), arrêt anticipé sans perte ; tests unitaires et intégration, vérifié à l'écran (ordinateur et mobile)
- [ ] Ressources, étape 3 : suggestions de ressources (recherche web avec liens vérifiés, textes sur mesure)
- [ ] (Optionnel) Vérifier le fournisseur Google avec une vraie clé — testé uniquement avec l'API simulée
- [ ] Vérification manuelle de la reconnaissance vocale sur un vrai navigateur avec micro (impossible en headless)

---

# PHASE 1 — Initialisation

- [x] Initialiser le projet
- [x] Configurer Next.js
- [x] Configurer TypeScript
- [x] Configurer Tailwind
- [x] Configurer shadcn/ui
- [x] Configurer la base de données
- [x] Configurer Prisma
- [x] Créer les migrations initiales
- [x] Configurer Zod
- [x] Créer .env.example
- [x] Créer README.md
- [x] Configurer les scripts de développement
- [x] Configurer les tests
- [x] Vérifier une installation propre

---

# PHASE 2 — Structure de l'application

- [x] Layout responsive
- [x] Navigation desktop
- [x] Navigation mobile
- [x] Page Aujourd'hui
- [x] Page Cours
- [x] Page Connaissances
- [x] Page Erreurs
- [x] Page Progression
- [x] Page Paramètres
- [x] États vides
- [x] États de chargement
- [x] États d'erreur

---

# PHASE 3 — Base de données

- [x] User
- [x] Lesson
- [x] SourceDocument
- [x] KnowledgeItem
- [x] Vocabulary
- [x] GrammarPoint
- [x] Sentence
- [x] LessonKnowledge
- [x] Example
- [x] ReviewState
- [x] ReviewAttempt
- [x] Mistake
- [x] LearningSession
- [x] Exercise
- [x] SpeakingAttempt
- [x] Ajouter les index
- [x] Ajouter les contraintes
- [x] Tester les migrations depuis une base vide

---

# PHASE 4 — Import PDF

- [x] Drag & drop
- [x] Sélection fichier
- [x] Validation PDF
- [x] Stockage du fichier
- [x] Extraction du texte
- [x] Conservation des pages
- [x] Statut de traitement
- [x] Gestion PDF corrompu
- [x] Gestion échec extraction
- [x] Tester sur les vrais PDF

---

# PHASE 5 — Intelligence artificielle

- [x] Créer abstraction AIProvider
- [x] Configurer fournisseur IA
- [x] Créer schémas Zod
- [x] Extraction vocabulaire
- [x] Extraction pinyin
- [x] Extraction traduction
- [x] Extraction grammaire
- [x] Extraction phrases
- [x] Extraction corrections
- [x] Extraction exercices
- [x] Scores de confiance
- [x] Provenance
- [x] Gestion timeout
- [x] Gestion retry
- [x] Gestion JSON invalide
- [x] Détection doublons
- [x] Tests avec vrais PDF

---

# PHASE 6 — Validation de l'import

- [x] Page de prévisualisation
- [x] Afficher vocabulaire
- [x] Afficher grammaire
- [x] Afficher phrases
- [x] Afficher corrections
- [x] Modifier vocabulaire
- [x] Modifier grammaire
- [x] Modifier phrases
- [x] Supprimer élément
- [x] Approuver élément
- [x] Tout approuver
- [x] Identifier éléments incertains
- [x] Sauvegarder le cours validé

---

# PHASE 7 — Cours

- [x] Historique des cours
- [x] Tri par date
- [x] Fiche cours
- [x] Afficher document source
- [x] Afficher vocabulaire
- [x] Afficher grammaire
- [x] Afficher phrases
- [x] Afficher corrections
- [x] Liens vers connaissances

---

# PHASE 8 — Base de connaissances

- [x] Liste
- [x] Recherche Hanzi
- [x] Recherche pinyin
- [x] Recherche français
- [x] Filtres
- [x] Fiche vocabulaire
- [x] Fiche grammaire
- [x] Fiche phrase
- [x] Afficher cours source
- [x] Badges de provenance
- [x] Historique de révision
- [x] État de maîtrise

---

# PHASE 9 — Moteur de répétition

- [x] Définir l'algorithme
- [x] Documenter l'algorithme
- [x] Tester l'algorithme
- [x] Sélection des éléments dus
- [x] Sélection des nouveaux éléments
- [x] Priorité aux erreurs
- [x] Génération d'une session
- [x] Sauvegarde des tentatives
- [x] Mise à jour de la prochaine révision
- [x] Gestion des jours manqués

---

# PHASE 10 — Exercices

- [x] Chinois → français
- [x] Français → chinois
- [x] Pinyin
- [x] Phrase à trou
- [x] Reconstruction
- [x] Traduction
- [x] Grammaire
- [x] Révélation de la réponse
- [x] Auto-évaluation
- [x] Évaluation automatique lorsque fiable
- [x] Historique des réponses

---

# PHASE 11 — Session quotidienne

- [x] Calcul du travail du jour
- [x] Durée estimée
- [x] Bouton Commencer ma session
- [x] Création session
- [x] Progression
- [x] Exercice suivant
- [x] Raccourcis clavier
- [x] Fin de session
- [x] Résumé
- [x] Sauvegarde complète

---

# PHASE 12 — Erreurs

- [x] Créer automatiquement une erreur
- [x] Classifier l'erreur
- [x] Compter les occurrences
- [x] Détecter les erreurs récurrentes
- [x] Page Erreurs
- [x] Filtre erreurs récurrentes
- [x] Filtre erreurs récentes
- [x] Résoudre une erreur
- [x] Réouvrir une erreur si elle revient
- [x] Injecter les erreurs dans le planning
- [x] Bouton Retravailler

---

# PHASE 13 — Progression

- [x] Jours étudiés
- [x] Sessions
- [x] Révisions
- [x] Temps travaillé
- [x] Connaissances
- [x] Rétention
- [x] Éléments dus
- [x] Erreurs récurrentes
- [x] Maîtrise par dimension
- [x] Progression hebdomadaire

---

# PHASE 14 — Listening

- [x] Créer SpeechProvider
- [x] Text-to-speech chinois
- [x] Player audio
- [x] Audio → sens
- [x] Audio → chinois
- [x] Replay
- [x] Masquer texte avant réponse
- [x] Sauvegarder performances d'écoute

---

# PHASE 15 — Speaking

- [x] Permission microphone
- [x] Enregistrement
- [x] Arrêt enregistrement
- [x] Stockage temporaire
- [x] Speech-to-text
- [x] Transcription chinoise
- [x] Affichage transcription
- [x] Évaluation IA
- [x] Feedback court
- [x] Détection vocabulaire ciblé
- [x] Détection grammaire ciblée
- [x] Sauvegarder SpeakingAttempt
- [x] Transformer certaines erreurs en Mistake

---

# PHASE 16 — Conversation IA

- [x] Sélection vocabulaire cible
- [x] Sélection grammaire cible
- [x] Sélection erreurs pertinentes
- [x] Génération scénario
- [x] Interface conversation
- [x] Réponse texte
- [x] Réponse vocale
- [x] Réponse IA
- [x] Résumé de conversation
- [x] Détection erreurs
- [x] Sauvegarde résultats

---

# PHASE 17 — Préparation du prochain cours

- [x] Bouton Préparer mon prochain cours
- [x] Récupérer dernier cours
- [x] Récupérer erreurs récurrentes
- [x] Récupérer vocabulaire faible
- [x] Générer mini-session
- [x] Résumé de préparation

---

# PHASE 18 — QA avec les vraies données

Utiliser les vrais PDF.

- [x] Importer un PDF simple
- [x] Importer un PDF dense
- [x] Importer un PDF multi-pages
- [x] Tester tableaux si présents
- [x] Tester formats inhabituels
- [x] Vérifier caractères chinois
- [x] Vérifier pinyin
- [x] Vérifier accents français
- [x] Vérifier doublons
- [x] Vérifier références pages
- [x] Vérifier provenance
- [x] Corriger les problèmes découverts

---

# PHASE 19 — Responsive / UX

- [x] QA desktop
- [x] QA mobile
- [x] QA tablette
- [x] Navigation
- [x] Formulaires
- [x] Sessions sur mobile
- [ ] Microphone mobile (implémenté ; nécessite HTTPS sur téléphone — `npm run dev:https` ; à vérifier sur un vrai appareil)
- [x] États vides
- [x] États erreur
- [x] États chargement
- [x] Accessibilité
- [x] Focus clavier
- [x] Contraste

---

# PHASE 20 — Nettoyage

- [x] Supprimer code mort
- [x] Supprimer boutons factices
- [x] Supprimer données mock inutiles
- [x] Supprimer console.log
- [x] Vérifier TODO
- [x] Vérifier FIXME
- [x] Vérifier secrets
- [x] Vérifier dépendances inutiles

---

# PHASE 21 — Tests finaux

Depuis un environnement propre :

- [x] Installer les dépendances
- [x] Créer la base
- [x] Exécuter migrations
- [x] Lancer application
- [x] Importer vrai PDF
- [x] Analyser
- [x] Corriger extraction
- [x] Valider cours
- [x] Vérifier connaissances
- [x] Commencer session
- [x] Répondre correctement
- [x] Répondre incorrectement
- [x] Vérifier création erreur
- [x] Terminer session
- [x] Vérifier prochaine révision
- [x] Redémarrer application
- [x] Vérifier persistance
- [x] Tests unitaires
- [x] Tests intégration
- [x] Tests E2E
- [x] Lint
- [x] Typecheck
- [x] Build production

---

# PHASE 22 — Documentation

- [x] README complet
- [x] Installation
- [x] Configuration environnement
- [x] Configuration IA
- [x] Configuration audio
- [x] Base de données
- [x] Lancement développement
- [x] Lancement tests
- [x] Build production
- [x] Architecture
- [x] Limites connues

---

# DÉFINITION FINALE DE TERMINÉ

Ne pas déclarer le projet terminé tant que :

- [x] L'application démarre
- [x] Les vrais PDF peuvent être importés
- [x] L'analyse fonctionne
- [x] L'utilisateur peut corriger l'analyse
- [x] Les cours sont sauvegardés
- [x] Les connaissances sont sauvegardées
- [x] Les doublons sont correctement gérés
- [x] Les sessions quotidiennes fonctionnent
- [x] Le rappel actif fonctionne
- [x] L'algorithme de révision fonctionne
- [x] Les erreurs sont enregistrées
- [x] Les erreurs influencent les futures révisions
- [x] Les données persistent
- [x] Aucun écran critique n'est factice
- [x] Aucun bouton critique n'est factice
- [x] Les erreurs IA sont gérées
- [x] Le mobile est utilisable
- [x] Les tests passent
- [x] Le lint passe
- [x] TypeScript passe
- [x] Le build production passe
- [x] README permet une installation depuis zéro

Lorsque tout est validé :

créer :

`docs/FINAL_REPORT.md`

contenant :

- ce qui a été construit ;
- architecture finale ;
- fonctionnalités ;
- tests effectués ;
- fournisseurs externes nécessaires ;
- variables d'environnement ;
- limites restantes ;
- idées pour la V2.