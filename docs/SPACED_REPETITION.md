# Moteur de répétition espacée

Code : `src/lib/review/` (fonctions pures, testées dans `tests/unit/`).

## Principes

1. **La production compte plus que la reconnaissance.** Réussir « 付款 → payer » fait moins
   progresser l'intervalle que réussir « payer → 付款 ».
2. **Les erreurs sont des données.** Une réponse fausse crée ou incrémente une `Mistake` ;
   les erreurs actives augmentent la priorité de la connaissance.
3. **L'historique est immuable.** Chaque tentative est un `ReviewAttempt` ; les scores de
   maîtrise sont recalculables à partir de cet historique (`recomputeScores`).
4. **L'utilisateur ne choisit pas quoi réviser** : la session est composée automatiquement.

## État par connaissance (`ReviewState`)

| Champ | Rôle |
|---|---|
| `intervalDays` | intervalle « mémoire » courant |
| `ease` | facilité (1,3 – 3,0 ; départ 2,3) |
| `reps` | nombre de réussites espacées |
| `lapses` | oublis d'un élément déjà appris |
| `streak` | réussites consécutives |
| `nextReviewAt` | prochaine révision |
| 5 scores 0–100 | reconnaissance, production, écoute, prononciation, usage |

## Mise à jour après une tentative (`schedule`)

Résultats : `CORRECT`, `MOSTLY_CORRECT`, `INCORRECT`, `SKIPPED` (« je ne sais pas »).

**Échec** (`INCORRECT`, `SKIPPED`)
- intervalle × 0,4 (minimum 1 jour) si l'élément avait déjà été réussi, sinon 0 ;
- facilité −0,2 (−0,1 pour « je ne sais pas ») ;
- `lapses` +1 si l'élément était appris ; `streak` = 0 ;
- revu **dans la même session** (exercice de réapprentissage inséré 4 questions plus loin),
  puis au plus tôt le lendemain.

**Réussite**
- 1re réussite : 1 jour (3 si « facile ») ;
- réussite juste après un oubli : on repart de l'intervalle réduit ;
- 2e réussite : 3 jours × facteur de dimension (2 jours si `MOSTLY_CORRECT`) ;
- ensuite : `intervalle × facilité × facteur de dimension`
  (`MOSTLY_CORRECT` : intervalle × 1,2 et facilité −0,15).

Facteurs de dimension : reconnaissance 0,8 · écoute 0,9 · production 1,0 · prononciation 1,0 · usage 1,1.

Les intervalles sont bornés à [1 ; 365] jours ; au-delà de 3 jours, un aléa de ±5 % étale la charge.

### Jours manqués

- **Révision en retard réussie** : la moitié du retard est créditée
  (`(intervalle + retard × 0,5) × facilité`).
- **Révision anticipée** (préparation de cours) : la progression est proportionnelle au temps
  réellement écoulé, pour ne pas gonfler artificiellement l'intervalle.
- **Arriéré** : une session contient au plus `maxReviews` révisions, triées par priorité ;
  les nouveautés sont réduites (2 au maximum quand l'arriéré dépasse une session).

## Priorité d'une révision (`priority`)

```
retard relatif (plafonné à 3) + 1 si dû
+ 0,6 × occurrences d'erreurs actives (plafonné à 3)
+ 0,5 × (100 − score de production) / 100
+ 0,2 × oublis (plafonné à 2)
+ 0,3 si le cours date de moins de 7 jours
```

## Composition d'une session (`buildPlan`)

- **Quotidienne** : éléments dus avant ce soir minuit (par priorité) + jusqu'à 3 erreurs
  récurrentes même non dues + nouveautés (cours le plus récent d'abord, dans l'ordre des pages),
  entrelacées au milieu des révisions. Taille visée : durée cible ÷ 25 s par exercice.
- **Erreurs** : uniquement les éléments ayant une erreur active.
- **Préparation du prochain cours** : erreurs récurrentes (30 %), dernier cours (50 %), points faibles.
- **Cours** / **Connaissance** : éléments d'un cours précis ou d'une fiche (« Retravailler »).

## Choix de l'exercice (`chooseType`)

1. Une erreur active oriente l'exercice (ton → pinyin, ordre des mots → reconstruction, sens → reconnaissance…).
2. Vocabulaire : 1re fois reconnaissance, 2e fois production, ensuite la dimension la plus faible
   (la production est favorisée), en évitant de répéter les deux derniers types.
3. Phrases : reconstruction d'abord, puis traduction, écoute.
4. Grammaire : phrase à trous sur la structure (marqueurs repérés dans « 只要…就… »),
   sinon production libre évaluée par l'IA ou auto-évaluée.

La réponse n'est **jamais envoyée au navigateur** avant la tentative : le client reçoit
`PublicExercise` (sans `answer`) et le serveur évalue.

## Évaluation (`evaluateLocally`)

| Mode | Règle |
|---|---|
| caractères | égalité normalisée ; 1–2 caractères faux → erreur CARACTÈRE ; pinyin accepté (tons faux → MOSTLY_CORRECT + erreur TON) |
| pinyin | tons obligatoires ; tons absents → MOSTLY_CORRECT ; tons faux → INCORRECT (TON) ; syllabes fausses → PINYIN |
| sens | correspondance tolérante (accents, articles, faute de frappe légère) ; sinon **jugement** |
| ordre | égalité normalisée ; sinon ORDRE DES MOTS |
| libre | égalité exacte ; sinon **jugement** |

Jugement : l'utilisateur voit la réponse attendue et s'auto-évalue (« J'avais bon / Presque / Faux »),
ou demande l'avis de l'IA quand elle est disponible.

## Maîtrise multidimensionnelle

Chaque tentative met à jour le score de sa dimension par moyenne mobile exponentielle
(α = 0,35 ; cible 100 / 60 / 0). Une production réussie augmente un peu la reconnaissance.

Niveaux affichés (`masteryLevel`, via `masteryOf` partout : fiches, listes, cours, thèmes, progression) :

| Niveau | Condition (évaluée dans cet ordre) |
|---|---|
| Nouveau | jamais révisée (`reps = 0`) |
| À travailler | erreurs non résolues pesant ≥ 2 occurrences, ou ≥ 2 oublis avec un intervalle < 7 j |
| Maîtrisé | intervalle ≥ 21 j et production ≥ 70 |
| Consolidé | intervalle ≥ 7 j et max(production, 0,8 × reconnaissance) ≥ 55 |
| À travailler | au moins 1 erreur non résolue et max(production, 0,8 × reconnaissance) < 50 |
| En cours | tous les autres cas |

La tuile « notions consolidées » de la page Progression compte les notions révisées dans la semaine qui sont
actuellement consolidées ou maîtrisées selon cette même règle.

## Erreurs

- Clé d'une erreur : (connaissance, catégorie). Une même erreur qui revient incrémente `occurrences`.
- **Récurrente** : ≥ 2 occurrences non résolues.
- **Résolution** : manuelle, ou automatique après 3 réussites consécutives.
- **Réouverture** : automatique si elle revient après résolution (`reopenedCount`).
- « Je ne sais pas » est un échec de rappel (replanification), pas une réponse fausse : il ne crée pas d'erreur.
