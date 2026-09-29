# Décisions techniques

## D1 — Stack : Next.js 16 + Prisma 6 + SQLite
- Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind 4, shadcn/ui, Zod 4.
- **SQLite** en local : installation sans serveur de base de données. Le schéma Prisma reste
  compatible PostgreSQL (changer `provider` et `DATABASE_URL`).
- Prisma 6.19 (stable) plutôt que la version 8 encore en release candidate.
- Les champs `Json` n'ont pas de valeur par défaut en base (limite SQLite) : le code les fournit toujours.

## D2 — IA sur l'abonnement Claude, sans clé API
Demande de l'utilisateur : ne pas payer l'API pour un usage personnel.
- Fournisseur par défaut : **CLI Claude Code en mode non interactif** (`claude -p`), qui utilise la
  session Claude déjà connectée sur la machine.
- Isolation de chaque appel : dossier temporaire, `--restricted`, `--strict-mcp-config`,
  `--no-session-persistence`, prompt système dédié, outils limités à `Read` (lecture du PDF) ou aucun.
- Sortie contrainte par `--json-schema` (généré depuis Zod) puis revalidée par Zod.
- Alternatives : `AI_PROVIDER=anthropic` (clé API), `none` (sans IA), `mock` (tests uniquement,
  bandeau « IA simulée » affiché).
- Modèles : `opus` pour l'analyse des cours (qualité, une fois par cours), `haiku` pour les
  évaluations et conversations (latence). Configurables par variables d'environnement.

## D3 — Lecture visuelle du PDF par l'IA
Les dialogues du cours réel sont des **images** (pages 5–9) et le pinyin des notes est rendu par une
police à pinyin intégré. L'extraction texte seule ne suffit pas : le CLI reçoit une copie du PDF et
peut en lire les pages. Test : 29 répliques et 11 mots surlignés récupérés sur des pages 100 % images.

## D4 — Extraction heuristique de repli
Sans IA (ou si elle échoue), un parseur local générique extrait les lignes `汉字 + pinyin + glose`,
les notes `词 - sens`, les blocs `语法 / Structure`, les corrections `✗ … → …` et les questions.
Résultat marqué « Extraction simple », confiance basse pour les notes libres.

## D5 — Anglais et français
Les supports de la professeure glosent en **anglais**. On conserve deux champs (`english`, `french`)
avec leur provenance. L'IA traduit en français (provenance `AI`). Les exercices utilisent le français,
sinon l'anglais (affiché comme tel).

## D6 — Provenance au niveau du champ
`TEACHER` / `AI` / `USER` est stocké pour le pinyin, le français, l'anglais, les explications, et
séparément pour le texte et la traduction des exemples. Une traduction sans provenance explicite n'est
jamais attribuée à la professeure. Toute modification utilisateur passe le champ en `USER`.
Les phrases produites par l'élève en cours (zones « Practice ») sont importées en `USER`.

## D7 — Validation explicite
Rien n'entre dans la base avant validation. Seuls les éléments **approuvés** sont ajoutés
(« Tout approuver » disponible). Le brouillon est enregistré automatiquement.

## D8 — Déduplication
Clé canonique `TYPE:hanzi normalisé`. Même hanzi + même pinyin (sans tons) → rattachement proposé ;
pinyin différent (ex. 行 xíng / háng) → création séparée proposée. L'utilisateur peut changer le choix.
Un rattachement ne remplit que les champs vides : rien n'est écrasé.

## D9 — Réponse jamais exposée au client
Le plan de session (avec réponses) reste sur le serveur ; le navigateur reçoit l'exercice sans réponse
et le serveur évalue. La session est reprise là où elle s'était arrêtée.

## D10 — Audio via le navigateur
Synthèse (`speechSynthesis`) et reconnaissance (`SpeechRecognition`) du navigateur : gratuites, sans
clé. Abstraction `SpeechProvider` pour brancher un service serveur plus tard. Si l'audio est absent,
les exercices d'écoute peuvent être passés sans pénalité et l'oral peut être saisi au clavier.

## D11 — Analyse en arrière-plan
L'analyse IA (1 à 3 min) tourne dans le processus serveur ; la page interroge un endpoint de statut.
Une analyse interrompue (redémarrage) est marquée échouée après 15 min et peut être relancée.

## D12 — Normalisation des radicaux Unicode
Certains PDF encodent 行 comme le radical ⾏ (U+2F8F) ou 车 comme ⻋ (U+2ECB). Ces caractères sont
normalisés à l'extraction (NFKC limité aux radicaux + table), sans toucher à la ponctuation chinoise.

## D13 — Fichiers originaux
`source-materials/pdf/` est en lecture seule (droits retirés sur la copie de travail). L'import copie
le fichier dans `DATA_DIR/uploads/`. `source-materials/` est exclu de git (cours personnels).

## D14 — Voix naturelle : Google Chirp 3 HD, générée une fois
Demande de l'utilisateur : une voix chinoise « très humaine ». Comparaison (septembre 2026) : Google Chirp 3 HD
(1 M caractères gratuits/mois), Azure neural (500 k), ElevenLabs (10 k gratuits), modèles libres locaux (lourds).
Choix : **Google Chirp 3 HD**, voix `cmn-CN-Chirp3-HD-<Nom>`, clé API côté serveur (`GOOGLE_TTS_API_KEY`).
- Cache disque par (voix, vitesse, texte) dans `DATA_DIR/tts/`, écriture atomique, déduplication des requêtes
  simultanées ; en-têtes HTTP `immutable` (la voix fait partie de l'URL pour qu'un changement de voix soit pris en compte).
- Pré-génération à la validation d'un cours (3 requêtes en parallèle, arrêt si quota atteint).
- Repli automatique sur la synthèse du navigateur (non configuré, erreur, quota).
- La reconnaissance vocale reste celle du navigateur.

## D15 — Utilisateur unique à identifiant fixe
Des requêtes simultanées au tout premier chargement avaient créé plusieurs lignes `User`. La création passe désormais
par un `upsert` sur l'identifiant fixe `default-user` ; l'utilisateur le plus ancien reste celui utilisé.
Les deux lignes vides créées par ce bug ont été supprimées (aucune donnée ne leur était rattachée).

## D16 — Voix par défaut : Microsoft Edge (sans compte), Google en option
Google Cloud impose un compte avec facturation, que l'utilisateur n'a pas pu créer. Choix de l'utilisateur : **edge-tts**
(voix neuronales Microsoft via le service de lecture d'Edge), implémenté avec la bibliothèque Node `msedge-tts` (MIT),
directement dans le serveur (pas de Python).
- `TTS_PROVIDER=edge|google|none` ; même cache disque, même repli navigateur, voix par fournisseur.
- Risque assumé et affiché dans l'interface : service **non officiel**, pouvant cesser de fonctionner.
  Les phrases déjà générées restent en cache ; la voix du navigateur prend le relais pour les nouvelles.
- Tests : service simulé (aucun appel réseau) ; `TTS_PROVIDER=none` dans les suites automatisées.

## D17 — Transcription locale Whisper quand la reconnaissance du navigateur échoue
Constat : l'utilisateur utilise **Brave**, qui expose `webkitSpeechRecognition` mais n'a pas accès au service de Google :
l'API échoue systématiquement avec l'erreur `network` (même chose dans Arc, Opera, Vivaldi, Electron ; absente de Firefox).
- Repli : l'enregistrement (déjà capturé par `MediaRecorder`) est décodé et rééchantillonné en mono 16 kHz dans le
  navigateur (`OfflineAudioContext`), envoyé à `POST /api/transcribe`, et transcrit par **Whisper small** via
  `@huggingface/transformers` (onnxruntime-node, processeur, quantifié q8). Sortie convertie en simplifié (`opencc-js`)
  et ponctuation chinoise normalisée.
- Choix : gratuit, local (aucun audio envoyé à un tiers), sans Python ; ~1–2 s par réponse sur Mac, modèle de ~260 Mo
  téléchargé une fois dans `DATA_DIR/models/`. Alternatives écartées : services cloud (compte/clé), Whisper dans le
  navigateur (modèle téléchargé par navigateur, plus lent sans WebGPU).
- La reconnaissance du navigateur reste utilisée quand elle marche (transcription en direct) ; Brave est détecté
  (`navigator.brave`) et une erreur `network`/`service-not-allowed` la désactive pour la page. Aucun message
  d'erreur n'est alors affiché : Whisper prend le relais à l'arrêt du micro.
- `STT_PROVIDER=whisper|none`, `WHISPER_MODEL`. Tests : moteur simulé ; E2E avec `STT_PROVIDER=none`.

## D18 — Thèmes transversaux, alimentés automatiquement
Constat de l'utilisateur : un même cours de conversation mélange de nombreux sujets (salaire, cuisine, informatique…).
- Modèle : `Theme` (nom unique par utilisateur, emoji, description, provenance `AI`/`USER`) et `KnowledgeTheme`
  (lien plusieurs-à-plusieurs, provenance du rangement). `KnowledgeItem.themesClassifiedAt` marque les éléments rangés.
- **Rangement incrémental** : après chaque validation de cours, les éléments jamais rangés sont envoyés à l'IA (lots de 70,
  identifiants courts `e1…`) avec la liste des thèmes existants ; consigne : réutiliser en priorité, créer seulement si
  nécessaire, 1 thème (2 au maximum) par élément, sujets de conversation concrets, pas de fourre-tout.
  Une seule exécution à la fois (les demandes pendant l'exécution sont regroupées dans une nouvelle passe).
- **Les choix de l'utilisateur ne sont jamais écrasés** : seuls les éléments jamais rangés passent par l'IA ; ajouter ou
  retirer un mot à la main le marque comme rangé. Renommer un thème le passe en `USER`.
- Supprimer un thème ne supprime aucune connaissance (les éléments sans thème vont dans « Non classés ») ; la fusion
  déplace les liens. Sans IA : message clair, rangement manuel possible.
- La grammaire n'est pas rangée par thème (section dédiée). « Réviser ce thème » réutilise les sessions ciblées (`KNOWLEDGE`).
- Premier rangement réel (Claude, 2 cours, 96 éléments) : 38 s, 19 thèmes, 12 éléments dans deux thèmes.

## D19 — Ressources externes (articles, textes, documents)
Demande de l'utilisateur : apprendre aussi avec des contenus trouvés en ligne (il regarde surtout YouTube), en retrouvant
les mots de la ressource dans ses révisions. Étape 1 : texte collé, lien d'article, fichier (PDF, Word, texte, sous-titres SRT/VTT).
- **Modèle** : une ressource est un `Lesson` de type `RESOURCE` (+ table `Resource` : type, lien, site, texte). Elle réutilise
  le brouillon, la validation, la déduplication, les thèmes, la pré-génération audio et « Réviser » — sans apparaître dans
  l'historique des cours, la préparation du cours suivant ni les questions de la professeure.
- **Provenance** : nouvelle valeur `EXTERNAL` (« Ressource »). Les mots et phrases de contexte sont `EXTERNAL`, les sens et
  traductions `AI`, les données du dictionnaire `EXTERNAL`. À la validation, toute provenance `TEACHER` est refusée pour une ressource.
- **Tri local, sans IA** : découpage `Intl.Segmenter` corrigé par dictionnaire (fusion de segments formant un mot connu,
  particule collée détachée) ; liste **HSK 3.0** embarquée (« complete-hsk-vocabulary », MIT, 11 470 mots : niveau, fréquence,
  pinyin, anglais). Statut de chaque mot : connu (connaissances + mots déclarés connus `KnownWord`), supposé connu (HSK ≤ niveau
  de l'utilisateur, réglable, 2 par défaut) ou nouveau. **Taux de mots connus** affiché (zone idéale 90–95 %), recalculé en direct.
- **Mots proposés** : « utiles » (répétés dans le texte, ou HSK proche du niveau/fréquents) et « rares » (repliés). 15 mots cochés
  d'office au maximum, d'abord les mots HSK proches du niveau ; les expressions propres au texte ne sont jamais cochées d'office.
- **IA** (Opus via l'abonnement) : sens en contexte, pinyin des polyphones, forme corrigée d'un mot mal découpé (acceptée seulement
  si elle figure dans le texte), noms propres écartés, expressions réutilisables (≤ 8 caractères), traduction de la phrase de contexte.
  Lots de 30 mots traités en parallèle. Haiku testé : plus lent (> 5 min, délai dépassé) sur cette tâche, écarté.
  Sans IA ou en cas d'échec : pinyin et sens anglais du dictionnaire, signalé ; les mots sans sens ne peuvent pas être cochés.
- **Priorité en révision** : les cours restent prioritaires. Les mots issus uniquement de ressources ont au plus un tiers des
  nouveautés d'une session (au moins une place s'il y en a et que le budget ≥ 2) et prennent les places non utilisées par les cours ;
  pas de bonus « cours récent ».
- Traditionnel converti en simplifié (opencc), renvois de notes `[1]` retirés, 30 000 caractères au maximum. Liens Bilibili :
  message clair. Le texte est stocké localement, jamais la vidéo.

## D20 — Vidéos YouTube (étape 2 des ressources)
- **Sous-titres d'abord** : API publique du lecteur YouTube (client « Android », sans clé ni compte) → pistes de sous-titres au
  format json3. Priorité : sous-titres de l'auteur en simplifié, puis traditionnel (converti), puis sous-titres automatiques
  (signalés comme pouvant contenir des erreurs). Si l'API change, yt-dlp (s'il est installé) sert de secours.
- **Whisper en dernier recours** : le téléchargement direct de l'audio est coupé par YouTube après ~1 minute (jeton exigé),
  d'où **yt-dlp** (facultatif, `YTDLP_PATH`) + **ffmpeg** (`FFMPEG_PATH`) → audio mono 16 kHz, fichiers temporaires supprimés.
  Transcription locale par blocs de ~2 min coupés dans un silence, avec horodatage et progression réelle. Mesure : whisper-small
  ≈ 2,2 × la durée de la vidéo sur le processeur, donc limite `WHISPER_VIDEO_MAX_MINUTES` (15 par défaut, signalée). Boucles
  de répétition de Whisper (« 订阅，订阅，订阅… ») supprimées. Sans les outils : message clair avec la commande d'installation.
- **Données** : `Resource.mediaId`, `durationSec`, `segments` (répliques `{s, e, t}`), `transcriptSource` (CAPTIONS /
  AUTO_CAPTIONS / WHISPER). Le texte analysé = une réplique par ligne, ce qui donne à chaque mot proposé le moment où il est
  prononcé (`resource.time`, bouton « ▶ 1:23 »). Le statut « Transcription » (EXTRACTING) précède l'analyse habituelle.
- **Lecteur** : API iframe officielle sur youtube-nocookie.com ; transcription synchronisée (suivi automatique désactivable),
  mots cliquables par délégation d'événement (pas des milliers d'arrêts de tabulation ; les horodatages restent des boutons),
  fiche du mot avec provenance du sens (tes connaissances / IA / dictionnaire HSK anglais). Vidéo non intégrable ou hors ligne :
  message et lien YouTube, la transcription reste utilisable.
- **Mots transparents** : un mot hors HSK formé uniquement de caractères déjà connus comme mots (这个 = 这 + 个) est supposé connu
  (constaté sur une vraie vidéo : 这个 était proposé).

## D21 — Rythme quotidien et signal d'arrêt
- **Problème** : les limites étaient par session. Enchaîner les sessions ajoutait 8 nouveautés à chaque fois, et chaque notion
  revient ensuite en révision : un soir d'enthousiasme crée un arriéré quelques jours plus tard, principale cause d'abandon.
- **Plafond quotidien** `User.newItemsPerDay` (10 par défaut, 0–50) : une notion compte comme nouvelle le jour de sa toute
  première tentative, quelle que soit la session. Les sessions quotidiennes reçoivent `min(par session, reste du jour)`
  nouveautés ; la réduction existante en cas d'arriéré s'applique par-dessus. Les sessions ciblées (cours, thème, connaissance)
  restent un choix explicite et ne sont pas plafonnées, mais leurs nouveautés comptent dans le plafond.
- **Journée validée** = une session quotidienne terminée aujourd'hui. L'accueil remplace alors le gros bouton par le bilan du
  jour et une estimation de demain (plan simulé à demain midi avec un plafond neuf), la page Réviser et l'écran de fin de
  session disent la même chose. Bouton secondaire « Encore un peu (révisions seulement) » seulement s'il reste des révisions
  dues : jamais de nouveautés, pour ne pas alourdir les jours suivants.
- Pas de série de jours ni de pénalité : cela pousse au volume plutôt qu'à la régularité.
- **Arrêt conseillé en cours de session** (`lib/review/pace.ts`, calculé par le serveur à chaque exercice) : « fatigue » si le
  taux de réussite des 8 dernières réponses (réussi = 1, presque = 0,5) passe sous 60 %, en excluant les nouveautés (se tromper
  sur une notion vue pour la première fois est normal) et les exercices passés ; « durée » si le temps actif dépasse
  max(1,5 × la durée estimée, estimée + 5 min). Rien quand il reste moins de 3 exercices. La carte apparaît après la correction :
  « Terminer maintenant » ou « Continuer quand même » (Entrée) ; une proposition refusée n'est plus répétée dans la session.
  Arrêter ne perd rien : les révisions non faites restent dues, les nouveautés non vues restent à venir (et ne comptent pas
  dans le plafond du jour) ; le bilan indique combien d'exercices reviendront.
