# Chinese Learning OS

Application web personnelle qui transforme chaque cours de chinois (les PDF de la professeure)
en connaissances réellement mémorisées et utilisables à l'oral :

**PDF → extraction → validation → connaissances → répétition espacée → rappel actif → erreurs → nouvelles révisions**,
puis écoute, oral et conversation.

- Interface en français, contenu en chinois simplifié + pinyin + français.
- Fonctionne **sans clé API** : l'IA passe par ton abonnement Claude (Claude Code), ou peut être désactivée.
- Données locales (SQLite), aucun service externe obligatoire.

---

## Sommaire

1. [Prérequis](#prérequis)
2. [Installation](#installation)
3. [Configuration de l'environnement](#configuration-de-lenvironnement)
4. [Configuration de l'IA](#configuration-de-lia)
5. [Configuration audio](#configuration-audio)
6. [Base de données](#base-de-données)
7. [Lancement en développement](#lancement-en-développement)
8. [Tests](#tests)
9. [Build de production](#build-de-production)
10. [Utilisation](#utilisation)
11. [Architecture](#architecture)
12. [Limites connues](#limites-connues)

---

## Prérequis

| Outil | Version | Rôle |
|---|---|---|
| Node.js | ≥ 20.9 (testé avec 24) | exécution |
| npm | ≥ 10 | dépendances |
| Claude Code (`claude`) | facultatif | IA via ton abonnement Claude |
| Navigateur récent | Chrome, Edge, Safari, Brave, Arc, Firefox | audio ; transcription en direct dans Chrome/Edge/Safari, sinon Whisper local |
| Connexion internet | pour les nouvelles phrases | voix chinoise naturelle (Microsoft Edge) ; ensuite hors ligne grâce au cache |

Aucune base de données à installer : SQLite est embarqué.

## Installation

```bash
git clone <ce dépôt> chinese-learning-os
cd chinese-learning-os

# 1. Variables d'environnement
cp .env.example .env

# 2. Dépendances
npm install
# Si npm signale des « install scripts not yet covered by allowScripts » (npm ≥ 11) :
#   npm install-scripts approve prisma @prisma/client @prisma/engines esbuild unrs-resolver
#   npm rebuild

# 3. Base de données (création + migrations)
npm run setup

# 4. Lancement
npm run dev
```

Ouvre ensuite <http://localhost:3000>.

## Configuration de l'environnement

Toutes les variables sont documentées dans [`.env.example`](.env.example).

| Variable | Défaut | Description |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | base SQLite (chemin relatif au dossier `prisma/`) |
| `DATA_DIR` | `./data` | copies internes des PDF et enregistrements audio |
| `AI_PROVIDER` | `claude-cli` | `claude-cli`, `anthropic`, `none` ou `auto` |
| `CLAUDE_CLI_PATH` | `claude` | chemin du CLI Claude Code |
| `CLAUDE_CLI_MODEL_SMART` / `_FAST` | `opus` / `haiku` | modèles utilisés via le CLI |
| `ANTHROPIC_API_KEY` | — | uniquement avec `AI_PROVIDER=anthropic` |
| `ANTHROPIC_MODEL_SMART` / `_FAST` | `claude-opus-5` / `claude-haiku-4-5` | modèles de l'API |
| `AI_LESSON_TIMEOUT_MS` | `600000` | délai maximal d'analyse d'un cours |
| `TTS_PROVIDER` | `edge` | voix chinoise serveur : `edge` (sans clé), `google` ou `none` |
| `GOOGLE_TTS_API_KEY` | — | uniquement avec `TTS_PROVIDER=google` |

Le fichier `.env` n'est jamais commité. Les clés restent côté serveur.

## Configuration de l'IA

L'IA sert à : analyser les PDF (y compris les pages en image), traduire les gloses anglaises en français,
corriger les réponses libres, évaluer l'oral et animer les conversations. Tout le reste fonctionne sans elle.

### Option 1 — Abonnement Claude, sans clé API (recommandé)

1. Installe Claude Code : <https://claude.com/claude-code>.
2. Lance `claude` une fois dans un terminal et connecte-toi (`/login`) avec ton compte Claude (Pro ou Max).
3. Dans `.env` : `AI_PROVIDER="claude-cli"`.

L'application appelle `claude -p` en local, dans un dossier temporaire isolé, sans outil autre que la lecture
du PDF. L'analyse d'un cours de 20 pages prend 1 à 3 minutes ; une correction ou une réplique de conversation,
5 à 15 secondes. L'usage compte dans les limites de ton abonnement.

Vérifie l'état dans **Paramètres → Intelligence artificielle**.

### Option 2 — API Anthropic

```env
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="sk-ant-..."
```

### Option 3 — Sans IA

`AI_PROVIDER="none"` : l'import utilise une **extraction simple** (tableaux de vocabulaire, notes « mot - sens »,
blocs de grammaire, corrections « ✗ … → … »), les réponses libres sont auto-évaluées, et la conversation est
désactivée avec un message clair.

## Configuration audio

### Voix chinoise naturelle (activée par défaut, sans compte)

Par défaut (`TTS_PROVIDER="edge"`), l'application utilise les **voix neuronales de Microsoft** (Xiaoxiao, Xiaoyi,
Yunxi, Yunjian, Yunyang, Yunxia) via le service de lecture à voix haute de Microsoft Edge, grâce à la bibliothèque
open source [msedge-tts](https://github.com/Migushthe2nd/MsEdgeTTS) (MIT). Aucune clé, aucun compte, gratuit.

- Choix de la voix : **Paramètres → Audio** (écoute d'essai de chaque voix).
- Chaque texte est généré **une seule fois** (en moins d'une seconde) puis gardé dans `data/tts/` : lecture instantanée,
  hors ligne ensuite. À la validation d'un cours, l'audio du vocabulaire, des phrases et des exemples est pré-généré.
- ⚠️ Ce service n'est **pas officiel** : Microsoft peut le modifier ou le couper. Dans ce cas, la voix du navigateur prend
  le relais automatiquement et les phrases déjà générées restent disponibles. Nécessite une connexion internet pour
  les nouvelles phrases.

**Option : Google Chirp 3 HD** (`TTS_PROVIDER="google"` + `GOOGLE_TTS_API_KEY`) — service officiel, 1 million de
caractères gratuits par mois, mais compte Google Cloud avec facturation obligatoire :
1. [Console Google Cloud](https://console.cloud.google.com/) → créer un projet → associer un compte de facturation
   (et une alerte de budget à 1 €).
2. *API et services → Bibliothèque* → activer **Cloud Text-to-Speech API**.
3. *Identifiants → Créer des identifiants → Clé API*, restreinte à Cloud Text-to-Speech API.
4. Dans `.env` : `TTS_PROVIDER="google"` et `GOOGLE_TTS_API_KEY="ta-clé"`, puis redémarrer.

**Option : sans synthèse serveur** : `TTS_PROVIDER="none"` (voix du navigateur uniquement).

### Voix du navigateur et reconnaissance vocale

Rien à installer : ces fonctions utilisent les API du navigateur.

- **Synthèse vocale** (écoute) : voix chinoise du système. Sur macOS : Réglages Système → Accessibilité →
  Contenu énoncé → Voix du système → ajouter une voix « Chinois (Chine continentale) ».
- **Reconnaissance vocale** (oral) : en direct dans Chrome, Edge ou Safari. Dans **Brave, Arc, Opera, Vivaldi ou
  Firefox**, la reconnaissance du navigateur ne fonctionne pas (Brave renvoie toujours une erreur « network ») :
  l'application transcrit alors l'enregistrement **en local avec Whisper** après l'arrêt du micro (voir ci-dessous).

### Transcription locale (Whisper)

`STT_PROVIDER="whisper"` (défaut) : l'enregistrement est converti dans le navigateur puis transcrit par le serveur
avec le modèle Whisper *small* (transformers.js + onnxruntime, sur le processeur, sans Python).
- Gratuit, sans compte ; l'audio **n'est envoyé à aucun service tiers**.
- Le modèle (~260 Mo) est téléchargé **une seule fois** au premier usage dans `data/models/` (environ 30 s à 1 min),
  puis fonctionne hors ligne. Ensuite : environ 1 à 2 s par réponse.
- Résultat en chinois simplifié, toujours modifiable avant l'analyse.
- Autre modèle : `WHISPER_MODEL` (ex. `onnx-community/whisper-base`, plus léger mais moins précis). Désactivation : `STT_PROVIDER="none"`.
- **Microphone sur téléphone** : les navigateurs exigent HTTPS hors `localhost`. Lance
  `npm run dev:https` puis ouvre `https://<IP-de-ton-ordinateur>:3000` sur le téléphone (accepte le certificat
  auto-signé).

La page **Paramètres → Audio** indique ce qui est disponible et permet de tester la voix.

## Base de données

```bash
npm run setup        # applique les migrations et génère le client Prisma
npm run db:migrate   # applique les nouvelles migrations
npm run db:reset     # ⚠️ efface toutes les données et recrée une base vide
npm run db:studio    # interface d'exploration des données
```

- Schéma : [`prisma/schema.prisma`](prisma/schema.prisma) — modèle décrit dans [`DATA_MODEL.md`](DATA_MODEL.md).
- Passer à PostgreSQL : remplacer `provider = "sqlite"` par `"postgresql"`, adapter `DATABASE_URL`, régénérer les migrations.
- Sauvegarde : copier `prisma/dev.db` et le dossier `data/`.

## Lancement en développement

```bash
npm run dev          # http://localhost:3000
npm run dev:https    # HTTPS sur le réseau local (micro sur téléphone)
```

Pour vérifier comment un nouveau PDF est lu (sans IA, sans base) :

```bash
npm run inspect-pdf -- "chemin/vers/cours.pdf"
```

Pour ranger par thème, en ligne de commande, les connaissances pas encore rangées (même traitement que l'application) :

```bash
npm run classify-themes
```

## Tests

```bash
npm run lint             # ESLint
npm run typecheck        # TypeScript
npm run test             # tests unitaires + intégration (Vitest, base de test dédiée)
npm run test:e2e         # parcours complets dans Chromium (Playwright, desktop + mobile)
npm run test:all         # tout
```

- Première exécution E2E : `npx playwright install chromium`.
- Les tests n'utilisent jamais ta base : intégration → `prisma/test.db`, E2E → `prisma/e2e.db` (recréées à chaque fois
  depuis une base vide, ce qui vérifie aussi les migrations).
- L'IA y est **simulée** (`AI_PROVIDER=mock`, un bandeau l'indique dans l'interface). Le test d'analyse rejoue une
  vraie réponse de Claude enregistrée sur le PDF réel (`tests/fixtures/`).
- Les tests utilisent le PDF réel de `source-materials/pdf/` et des PDF **synthétiques** (`tests/fixtures/synthetic/`,
  contenu fictif) pour couvrir d'autres formats : notes en français, tableau, PDF scanné, PDF corrompu.

## Build de production

```bash
npm run build
npm run start        # http://localhost:3000
```

## Utilisation

1. **Cours → Importer un cours** : dépose le PDF. L'analyse tourne en arrière-plan (tu peux quitter la page).
2. **Vérifie l'extraction** : corrige, supprime ou approuve chaque élément (vocabulaire, grammaire, phrases,
   corrections, exercices). Les éléments incertains sont signalés. Les doublons sont rattachés aux connaissances existantes.
3. **Valide** : les connaissances approuvées rejoignent ta base.
4. **Aujourd'hui → Commencer ma session** : l'application choisit quoi réviser (5 à 15 min). Une session par jour suffit :
   ensuite l'accueil affiche **« Journée validée »** avec la charge de demain. **10 nouvelles notions par jour** au maximum
   (réglable dans Paramètres), toutes sessions confondues ; « Encore un peu (révisions seulement) » permet de continuer sans
   ajouter de nouveautés. Si tes réponses se dégradent nettement ou si la session s'éternise, l'application te propose de
   t'arrêter (les exercices restants reviendront plus tard).
5. Les **erreurs** sont enregistrées automatiquement, reviennent en priorité et se résolvent après 3 réussites.
6. **Thèmes** : tes mots rangés par sujet de conversation (argent, travail, cuisine, informatique…), quel que soit
   le cours d'où ils viennent. Après chaque cours validé, l'IA range les nouveaux mots en réutilisant les thèmes
   existants (et en crée si besoin). Tu peux renommer, fusionner ou supprimer un thème (les mots sont conservés),
   ranger un mot à la main depuis sa fiche, et **réviser un thème** en une session.
7. **Ressources** : colle le lien d'une **vidéo YouTube**, d'un article, un texte (paroles, transcription…) ou un fichier
   (PDF, Word, texte, sous-titres `.srt`/`.vtt`). Pour une vidéo, les sous-titres chinois sont récupérés (ceux de l'auteur,
   sinon ceux de YouTube) ; sans sous-titres, l'audio est transcrit localement par Whisper (il faut `brew install yt-dlp ffmpeg`,
   environ 2 minutes de calcul par minute de vidéo, 15 minutes transcrites au maximum). Le **lecteur interactif** affiche la
   vidéo avec la transcription synchronisée : clique un horodatage pour y aller, un mot pour sa fiche (pinyin, sens, « Ajouter »,
   « Je le connais »), « Réécouter la phrase », vitesse 0,75×, « Écoute seule » (texte flouté). Chaque mot proposé a un bouton
   « ▶ 1:23 » pour l'entendre dans la vidéo. L'application découpe le texte en mots, affiche le **taux de mots connus**
   (idéal : 90–95 %), et propose les mots nouveaux les plus utiles, avec leur phrase de contexte, leur pinyin et leur sens
   (IA ou dictionnaire HSK). Coche ceux à apprendre, « Je le connais » pour les écarter définitivement, puis valide.
   Ces mots sont marqués « Ressource » (jamais « Professeure ») et restent moins prioritaires que ceux des cours.
   Règle ton niveau HSK estimé dans la page Ressources : les mots de ce niveau et en dessous sont supposés connus.
8. **Oral**, **Conversation IA** et **Préparer mon prochain cours** pour réutiliser ce que tu as appris.

Raccourcis en session : `Entrée` valider / continuer · `1` `2` `3` pour l'auto-évaluation.

## Architecture

```
src/
  app/                 pages (App Router), routes API, actions serveur
    (app)/             pages avec navigation : aujourd'hui, cours, connaissances, erreurs, progression…
    session/[id]/      session de révision plein écran + résumé
    api/               import PDF, statut d'analyse, PDF, oral (audio), réécoute
  features/            composants par domaine (lessons, review, speaking, conversation, knowledge…)
  components/          composants partagés (badges de provenance, pages, ui/ = shadcn)
  lib/
    ai/                abstraction AIProvider, fournisseurs (claude-cli, anthropic, mock), schémas Zod, tâches
    pdf/               extraction (unpdf) et extraction heuristique
    review/            répétition espacée, maîtrise, génération et évaluation d'exercices, composition de session
    chinese/           pinyin, normalisation, comparaison de réponses, liste HSK 3.0 (hsk-data.json, MIT)
    resources/         découpage en mots, taux de mots connus, tri des mots d'une ressource externe
    audio/             SpeechProvider (voix serveur Edge ou Google via /api/tts, repli sur l'API Web Speech du navigateur)
    db/                client Prisma
  server/              services applicatifs (cours, révisions, connaissances, erreurs, progression, oral, conversation)
prisma/                schéma et migrations
tests/                 unit/, integration/, e2e/, fixtures/
docs/                  analyse des PDF, algorithme, décisions, rapport final
```

Documents : [`docs/PDF_ANALYSIS.md`](docs/PDF_ANALYSIS.md) · [`docs/SPACED_REPETITION.md`](docs/SPACED_REPETITION.md) ·
[`docs/DECISIONS.md`](docs/DECISIONS.md) · [`docs/FINAL_REPORT.md`](docs/FINAL_REPORT.md).

## Limites connues

- **Deux PDF réels** (diaporama HSK et notes de conversation) ont servi de référence ; l'importeur est générique et testé aussi sur des formats synthétiques,
  mais de nouveaux gabarits pourront demander des ajustements de l'extraction simple (l'analyse IA s'adapte seule).
- **Sans IA**, le contenu des pages en image (scans, captures) n'est pas lu.
- L'analyse via Claude Code dépend de la session connectée sur la machine et des limites de l'abonnement.
- La **transcription en direct** dépend du navigateur (Chrome, Edge, Safari) ; ailleurs, Whisper local transcrit après
  l'arrêt du micro. Un homophone peut être mal transcrit (le texte reste modifiable avant l'analyse).
- Pas d'analyse fine de la prononciation (contour des tons) : prévu en phase 4 de la roadmap.
- **Ressources** : certains sites refusent la lecture automatique ou chargent leur texte en JavaScript (copie-colle alors le texte) ;
  seul YouTube est pris en charge pour les vidéos (Bilibili : importe les sous-titres). Les sous-titres automatiques et Whisper
  peuvent contenir des erreurs de reconnaissance (signalé). La récupération des sous-titres utilise l'interface publique du
  lecteur YouTube : si YouTube la modifie, installe yt-dlp (utilisé en secours) ou importe les sous-titres. Le découpage en mots est automatique :
  il peut couper un mot rare (l'IA corrige la plupart des cas, et tu peux ajouter un mot à la main). L'analyse IA d'un long
  article prend 1 à 3 minutes.
- Application mono-utilisateur, sans authentification : à utiliser en local.
- Le microphone sur téléphone nécessite HTTPS (`npm run dev:https`) ; il n'a pas pu être testé sur un vrai appareil.
# Chinesse-learning-os
