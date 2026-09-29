# Chinese Learning OS — Architecture technique

## Philosophie

Construire une application moderne mais simple.

Privilégier des technologies :

- populaires ;
- fiables ;
- maintenables ;
- bien documentées ;
- adaptées à Claude Code.

Éviter les architectures inutilement complexes.

---

# Stack recommandée

Frontend / Fullstack :

- Next.js
- React
- TypeScript

UI :

- Tailwind CSS
- shadcn/ui

Validation :

- Zod

Base de données :

- PostgreSQL

ORM :

- Prisma

Pour le développement local, SQLite peut être utilisé si cela simplifie fortement l'installation.

Cependant, le modèle doit rester facilement migrable vers PostgreSQL.

---

# Architecture générale

Interface utilisateur

↓

Services applicatifs

↓

Logique métier

↓

Repositories

↓

Base de données

---

# Services externes

Prévoir des adaptateurs pour :

- IA ;
- lecture PDF ;
- speech-to-text ;
- text-to-speech.

Ne pas mélanger directement les appels fournisseurs avec la logique métier.

---

# Organisation recommandée

src/

    app/

    components/

    features/

        lessons/

        knowledge/

        review/

        mistakes/

        listening/

        speaking/

        progress/

    lib/

        ai/

        pdf/

        review/

        audio/

        db/

    server/

    types/

---

# Couche IA

Créer une abstraction.

Exemple conceptuel :

AIProvider

Méthodes possibles :

analyzeLesson()

generateExamples()

evaluateAnswer()

evaluateSpeaking()

generateConversation()

explainMistake()

L'application ne doit pas dépendre profondément d'un fournisseur IA unique.

---

# Couche audio

Créer :

SpeechProvider

Méthodes :

transcribe()

synthesize()

Plus tard éventuellement :

analyzePronunciation()

---

# Pipeline PDF

PDF

↓

Extraction du texte

↓

Conservation des pages

↓

Nettoyage

↓

Segmentation

↓

Analyse IA

↓

Résultat structuré

↓

Validation Zod

↓

Gestion de confiance

↓

Prévisualisation utilisateur

↓

Validation utilisateur

↓

Base de données

---

# Références aux sources

Lorsque possible, conserver :

- fichier source ;
- numéro de page ;
- extrait source.

Cela permet de retrouver l'origine d'une connaissance.

---

# Réponses IA structurées

Éviter de parser du texte libre lorsque cela peut être évité.

Utiliser des réponses structurées.

Valider toutes les réponses IA avec Zod.

Exemple :

LessonExtraction {
    title
    date
    topics[]
    vocabulary[]
    grammarPoints[]
    sentences[]
    corrections[]
}

Vocabulary {
    hanzi
    pinyin
    french
    examples[]
    sourcePage
    confidence
}

---

# Gestion des erreurs IA

Une requête IA peut :

- échouer ;
- expirer ;
- retourner du JSON invalide ;
- halluciner ;
- produire des doublons ;
- retourner un résultat incomplet.

Tous ces cas doivent être gérés.

Un échec IA ne doit jamais provoquer la perte du PDF importé.

---

# Déduplication

Le même mot peut apparaître dans plusieurs cours.

Exemple :

旅行

Cours 4

Cours 7

Cours 11

Ne pas créer automatiquement trois connaissances indépendantes.

Créer une connaissance canonique associée à plusieurs cours.

---

# Sécurité

Les clés API restent côté serveur.

Variables d'environnement obligatoires.

Créer :

`.env.example`

Ne jamais commiter :

`.env`

clés API

tokens

credentials

---

# Mode sans IA

L'application doit rester lançable même sans clé IA.

Les fonctionnalités nécessitant l'IA doivent afficher une erreur claire ou être désactivées proprement.

Le reste de l'application doit continuer à fonctionner.

---

# Tests

## Unitaires

Tester :

- répétition espacée ;
- calcul des priorités ;
- déduplication ;
- validation des schémas ;
- scoring ;
- génération de sessions.

## Intégration

Tester :

PDF → extraction

Extraction → cours

Cours → connaissances

Révision → ReviewAttempt

Erreur → Mistake

## E2E

Tester :

import PDF
↓
validation
↓
cours
↓
session
↓
réponses
↓
erreurs
↓
progression

---

# Performance

Éviter les appels IA inutiles.

Mettre en cache les résultats stables.

Ne pas recalculer systématiquement :

- pinyin ;
- traductions ;
- explications ;
- exemples.

Batcher les opérations lorsque cela est pertinent.