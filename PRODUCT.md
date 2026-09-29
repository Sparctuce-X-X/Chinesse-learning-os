# Chinese Learning OS — Spécification produit

## Vision

Chinese Learning OS est une mémoire personnelle intelligente dédiée à l'apprentissage du chinois mandarin.

L'application transforme les vrais cours de chinois de l'utilisateur en connaissances mémorisables, révisables et utilisables à l'oral.

---

# Problème

L'utilisateur suit plusieurs cours de chinois par semaine avec une professeure.

Après chaque séance, de nombreuses informations utiles existent :

- nouveaux mots ;
- phrases ;
- expressions ;
- règles grammaticales ;
- corrections ;
- erreurs ;
- exemples ;
- exercices.

Ces informations sont principalement stockées dans des PDF.

Le problème est qu'accumuler des PDF ne signifie pas mémoriser leur contenu.

Relire les PDF régulièrement n'est pas suffisant.

Chinese Learning OS doit transformer ces informations en apprentissage actif.

---

# Objectif

Passer de :

> "J'ai vu ce mot."

à :

> "Je peux retrouver ce mot spontanément et l'utiliser dans une conversation."

---

# Boucle principale

Cours avec la professeure

↓

PDF / notes

↓

Import dans Chinese Learning OS

↓

Analyse IA

↓

Extraction des connaissances

↓

Validation utilisateur

↓

Ajout à la base personnelle

↓

Planification des révisions

↓

Rappel actif

↓

Écoute

↓

Production

↓

Erreur éventuelle

↓

Correction

↓

Nouvelle révision planifiée

↓

Utilisation spontanée

---

# Entités principales

Le système tourne autour de :

- Lesson
- SourceDocument
- KnowledgeItem
- Vocabulary
- Sentence
- GrammarPoint
- TeacherCorrection
- Exercise
- ReviewState
- ReviewAttempt
- Mistake
- LearningSession
- SpeakingAttempt

---

# Navigation principale

Desktop :

- Aujourd'hui
- Cours
- Connaissances
- Erreurs
- Progression
- Paramètres

Mobile :

- Aujourd'hui
- Cours
- Réviser
- Erreurs
- Plus

---

# Écran Aujourd'hui

L'écran principal doit immédiatement répondre à :

> Que dois-je faire aujourd'hui ?

Exemple :

---

Bonjour 👋

## Aujourd'hui

12 min de chinois

17 révisions

4 notions récentes

3 exercices d'oral

[ Commencer ma session ]

---

Cours récent

Cours du 24 septembre

12 nouveaux mots

3 structures grammaticales

5 phrases

---

Erreurs à retravailler

3 erreurs récurrentes

[ Voir mes erreurs ]

---

# Cours

Afficher l'historique chronologique des cours.

Chaque cours contient :

- date ;
- titre ;
- PDF original ;
- sujets ;
- vocabulaire ;
- grammaire ;
- phrases ;
- corrections ;
- statut de traitement.

Actions :

- Importer un cours
- Voir le PDF
- Voir les connaissances
- Modifier
- Ré-analyser

---

# Import d'un PDF

Parcours :

PDF
↓
Upload
↓
Extraction du texte
↓
Analyse IA
↓
Résultat structuré
↓
Prévisualisation
↓
Correction utilisateur
↓
Validation
↓
Création du cours
↓
Création des connaissances
↓
Planification des premières révisions

L'utilisateur doit toujours pouvoir corriger les résultats de l'IA avant validation.

---

# Base de connaissances

Créer une base personnelle de tout le chinois appris.

Filtres :

- Tout
- Vocabulaire
- Expressions
- Phrases
- Grammaire
- À travailler
- Maîtrisé

Recherche :

- caractères chinois ;
- pinyin ;
- français.

---

# Exemple d'une fiche vocabulaire

## 旅行

lǚxíng

voyager / voyage

### Origine

Cours du 12 septembre

Page 3

Professeure

### Exemple

我喜欢去中国旅行。

### Progression

Reconnaissance : élevée

Production : moyenne

Écoute : moyenne

Prononciation : à travailler

Usage spontané : à travailler

### Historique

Première apparition :
12 septembre

Dernière révision :
26 septembre

Prochaine révision :
29 septembre

Erreurs :
3

---

# Maîtrise multidimensionnelle

Ne pas utiliser un simple état :

CONNU / INCONNU.

Lorsque pertinent, suivre plusieurs dimensions :

- reconnaissance ;
- production ;
- écoute ;
- prononciation ;
- usage.

Les scores doivent être basés sur les interactions réelles.

---

# Session quotidienne

Durée cible habituelle :

5 à 15 minutes.

L'application compose automatiquement la session.

La session peut contenir :

- anciennes connaissances à revoir ;
- connaissances récentes ;
- erreurs récurrentes ;
- écoute ;
- production ;
- grammaire ;
- oral.

---

# Types d'exercices

## Reconnaissance

旅行

Que signifie ce mot ?

---

## Production

Comment dit-on :

"voyager"

en chinois ?

---

## Pinyin

Quel est le pinyin de :

旅行

---

## Écoute

Jouer un audio.

Question :

"Qu'as-tu entendu ?"

---

## Compréhension orale

Jouer une phrase.

Question :

"Que signifie cette phrase ?"

---

## Phrase à trou

我___去中国旅行。

---

## Reconstruction

Remettre les éléments dans le bon ordre.

---

## Traduction

Traduire une phrase vers le chinois.

---

## Production libre

"Explique où tu es parti l'année dernière."

---

## Oral

Afficher une question.

L'utilisateur répond au microphone.

---

# Erreurs

Les erreurs constituent une fonctionnalité centrale.

Chaque erreur peut contenir :

- connaissance concernée ;
- exercice ;
- question ;
- réponse utilisateur ;
- réponse attendue ;
- catégorie ;
- explication ;
- date ;
- nombre d'occurrences ;
- statut.

Catégories possibles :

- sens ;
- caractère ;
- pinyin ;
- ton ;
- prononciation ;
- grammaire ;
- ordre des mots ;
- classificateur ;
- écoute ;
- usage.

---

# Erreurs récurrentes

Lorsqu'une même erreur revient plusieurs fois :

augmenter automatiquement sa priorité.

Exemple :

## Erreur récurrente

旅行

Problème :

mauvais ton sur 旅.

Occurrences :

4

Dernière occurrence :

hier

[ Retravailler ]

---

# Listening

Les exercices d'écoute ne doivent pas afficher immédiatement le texte chinois.

Séquence :

audio
↓
tentative utilisateur
↓
réponse
↓
caractères
↓
pinyin
↓
traduction

---

# Speaking

Les exercices oraux utilisent prioritairement :

- vocabulaire récent ;
- vocabulaire faible ;
- grammaire récente ;
- erreurs récurrentes.

Exemple :

Connaissances ciblées :

去年
旅行
去过

Question :

去年你去了哪里？

L'utilisateur répond oralement.

Le système :

1. enregistre ;
2. transcrit ;
3. analyse ;
4. donne un feedback ;
5. détecte éventuellement des erreurs ;
6. enregistre les résultats.

---

# Feedback oral

Ne pas surcharger l'utilisateur.

Maximum recommandé :

1 à 3 corrections importantes par réponse.

Priorité :

1. erreur empêchant la compréhension ;
2. grammaire ciblée ;
3. vocabulaire ciblé ;
4. prononciation ;
5. naturel de la phrase.

---

# Conversation IA

Créer de petites conversations adaptées au niveau réel de l'utilisateur.

Les conversations doivent essayer de provoquer naturellement l'utilisation :

- du vocabulaire récent ;
- des notions dues ;
- des points faibles ;
- des structures grammaticales apprises.

Scénarios possibles :

- restaurant ;
- hôtel ;
- voyage ;
- travail ;
- rencontre ;
- achats ;
- taxi ;
- quotidien ;
- discussion avec un ami.

---

# Préparation avant cours

Fonction :

## Préparer mon prochain cours

Créer une courte session centrée sur :

- dernier cours ;
- connaissances fragiles ;
- erreurs récurrentes ;
- vocabulaire récent.

Objectif :

arriver au prochain cours capable de réutiliser ce qui a été appris.

---

# Provenance

Chaque information doit avoir une origine.

Valeurs :

TEACHER
AI
USER

L'interface doit permettre de distinguer clairement ces sources.

Une information générée par l'IA ne doit jamais être présentée comme provenant de la professeure.

---

# Progression

Afficher uniquement des métriques utiles.

Exemples :

- jours étudiés ;
- sessions terminées ;
- révisions effectuées ;
- minutes travaillées ;
- minutes d'oral ;
- connaissances apprises ;
- connaissances dues ;
- taux de rappel ;
- erreurs récurrentes ;
- évolution de la production.

Éviter les métriques purement décoratives.

---

# Indicateur produit principal

À long terme, l'indicateur le plus important est :

> Quelle proportion des notions enseignées peut encore être produite spontanément plusieurs semaines plus tard ?

Le produit doit optimiser la rétention et la production, pas simplement l'activité.