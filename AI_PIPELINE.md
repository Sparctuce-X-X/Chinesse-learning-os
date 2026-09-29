# Chinese Learning OS — Pipeline IA

## Objectif

L'IA doit réduire le travail manuel.

Elle ne doit pas devenir une source de vérité incontrôlée.

Les informations provenant directement de la professeure ont priorité.

---

# Analyse d'un cours

Entrées :

- texte extrait du PDF ;
- séparation des pages ;
- métadonnées disponibles.

Sortie :

structure de cours normalisée.

---

# Extraction du vocabulaire

Pour chaque vocabulaire :

- hanzi ;
- pinyin ;
- traduction française ;
- exemples ;
- page source ;
- texte source ;
- confiance ;
- provenance.

---

# Extraction grammaticale

Pour chaque structure :

- nom ;
- structure ;
- explication ;
- exemples ;
- page source ;
- confiance.

---

# Extraction des phrases

Pour chaque phrase :

- chinois ;
- pinyin si disponible ;
- traduction française si disponible ;
- page source.

---

# Extraction des corrections

Lorsque détectable :

- forme incorrecte ;
- forme correcte ;
- explication ;
- contexte ;
- page.

---

# Exercices présents dans le PDF

Extraire si possible :

- question ;
- type ;
- réponse ;
- contexte.

---

# Règle fondamentale

NE PAS INVENTER du contenu manquant pendant l'extraction.

Lorsqu'une information est incertaine :

confidence = LOW

---

# Informations générées

Si le PDF contient :

旅行

mais aucun pinyin,

et que l'IA génère :

lǚxíng

alors :

la provenance du pinyin doit indiquer qu'il a été généré par l'IA.

Même principe pour :

- traductions ;
- exemples ;
- explications.

---

# Validation utilisateur

Avant d'intégrer définitivement une extraction :

afficher une prévisualisation.

Sections :

Vocabulaire

Grammaire

Phrases

Corrections

Exercices

L'utilisateur peut :

- modifier ;
- supprimer ;
- approuver.

Prévoir :

[ Tout approuver ]

Les éléments à faible confiance doivent être clairement identifiables.

---

# Déduplication IA

Avant de créer une nouvelle connaissance :

chercher si une connaissance similaire existe.

Pour le vocabulaire chinois :

la forme Hanzi constitue un signal principal.

Tenir compte également :

- du pinyin ;
- du sens ;
- du contexte.

Ne pas fusionner automatiquement deux éléments réellement différents uniquement parce qu'ils partagent certains caractères.

---

# Évaluation des réponses

Ne pas utiliser uniquement une comparaison exacte de chaînes.

Exemple :

Question :

"Dis que tu es allé à Pékin l'année dernière."

Plusieurs réponses chinoises peuvent être acceptables.

L'évaluation peut retourner :

CORRECT
MOSTLY_CORRECT
INCORRECT

avec une explication courte.

---

# Évaluation orale

Pipeline :

microphone
↓
audio
↓
speech-to-text
↓
transcription chinoise
↓
analyse linguistique
↓
feedback
↓
détection des erreurs
↓
enregistrement

---

# Priorités du feedback

1. Compréhension.
2. Grammaire ciblée.
3. Vocabulaire ciblé.
4. Prononciation.
5. Naturel.

Ne pas transformer chaque réponse en cours complet.

Maximum :

1 à 3 corrections importantes.

---

# Conversation IA

Entrées :

- vocabulaire récent ;
- vocabulaire dû ;
- vocabulaire faible ;
- grammaire récente ;
- erreurs récurrentes ;
- niveau estimé.

Créer une conversation qui donne naturellement des occasions d'utiliser ces connaissances.

Ne pas constamment dire :

"Utilise le mot X."

Préférer une situation qui rend son utilisation naturelle.

---

# Génération d'exercices

Une connaissance peut produire plusieurs exercices.

Exemple :

终于

peut produire :

- chinois → français ;
- français → chinois ;
- pinyin ;
- écoute ;
- phrase à trou ;
- traduction ;
- phrase personnelle ;
- oral.

Éviter de générer plusieurs exercices presque identiques.

---

# Coûts IA

Réduire les appels inutiles.

Mettre en cache les résultats stables.

Batcher les analyses lorsque pertinent.

Ne pas régénérer une donnée simplement parce qu'une page est rechargée.

---

# Journalisation

Journaliser les erreurs techniques IA.

Ne jamais journaliser :

- clés API ;
- secrets ;
- données sensibles inutiles.

---

# Résilience

Prévoir :

- timeout ;
- retry raisonnable ;
- validation ;
- fallback ;
- messages utilisateur.

Une panne IA ne doit pas casser toute l'application.