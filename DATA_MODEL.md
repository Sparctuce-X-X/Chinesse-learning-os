# Chinese Learning OS — Modèle de données

Ce document décrit le modèle conceptuel.

Les noms exacts peuvent être adaptés lors de l'implémentation si nécessaire.

---

# User

Même si l'application est initialement personnelle, prévoir une entité User simple.

Champs :

id
name
createdAt
updatedAt

---

# Lesson

Représente un cours.

Champs :

id
userId
title
date
notes
processingStatus
createdAt
updatedAt

Relations :

documents
knowledgeItems
corrections

---

# SourceDocument

Document original associé à un cours.

Champs :

id
lessonId
filename
mimeType
storagePath
extractedText
processingStatus
createdAt

---

# KnowledgeItem

Entité générique représentant une connaissance.

Champs :

id
userId
type
sourceType
createdAt
updatedAt

Types :

VOCABULARY
GRAMMAR
SENTENCE
EXPRESSION

sourceType :

TEACHER
AI
USER

---

# Vocabulary

Champs :

knowledgeItemId
hanzi
pinyin
frenchMeaning
notes

---

# GrammarPoint

Champs :

knowledgeItemId
name
explanation
structure
notes

---

# Sentence

Champs :

knowledgeItemId
hanzi
pinyin
frenchTranslation

---

# LessonKnowledge

Association entre cours et connaissance.

Champs :

lessonId
knowledgeItemId
sourcePage
sourceText
confidence

Cette relation permet à une connaissance d'apparaître dans plusieurs cours.

---

# Example

Exemple associé à une connaissance.

Champs :

id
knowledgeItemId
hanzi
pinyin
french
sourceType

---

# ReviewState

État courant de révision.

Champs :

id
knowledgeItemId

recognitionScore
productionScore
listeningScore
pronunciationScore
usageScore

lastReviewAt
nextReviewAt

---

# ReviewAttempt

Une tentative réelle de révision.

Champs :

id
knowledgeItemId
sessionId

exerciseType

prompt
userAnswer
expectedAnswer

result
responseTimeMs

createdAt

---

# Résultat d'une tentative

Valeurs possibles :

CORRECT
MOSTLY_CORRECT
INCORRECT
SKIPPED

---

# Mistake

Erreur détectée.

Champs :

id
knowledgeItemId
reviewAttemptId

type

userAnswer
expectedAnswer
explanation

occurrences

firstSeenAt
lastSeenAt

resolvedAt

---

# Catégories d'erreurs

MEANING
CHARACTER
PINYIN
TONE
PRONUNCIATION
GRAMMAR
WORD_ORDER
CLASSIFIER
LISTENING
USAGE
OTHER

---

# LearningSession

Session de travail.

Champs :

id
userId

startedAt
completedAt
durationSeconds

reviewsCompleted
mistakesCount

---

# SpeakingAttempt

Tentative orale.

Champs :

id
userId
knowledgeItemId
sessionId

audioPath
transcription
feedback

createdAt

---

# Exercise

Exercice généré.

Champs :

id
knowledgeItemId
type
prompt
expectedAnswer
metadata
createdAt

---

# Types d'exercices

RECOGNITION
PRODUCTION
PINYIN
LISTENING
FILL_BLANK
SENTENCE_RECONSTRUCTION
TRANSLATION
GRAMMAR
SPEAKING
TONE

---

# Règles importantes

Toujours conserver la provenance.

Ne jamais écraser l'historique de révision.

Les ReviewAttempt doivent être considérés comme historiques.

Lorsque possible :

les scores doivent pouvoir être recalculés à partir de l'historique.

Ne pas perdre les associations entre :

connaissance
cours
document
page.