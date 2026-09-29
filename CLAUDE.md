# Chinese Learning OS — Instructions pour Claude Code

## Mission

Construire une application web personnelle de qualité production appelée :

# Chinese Learning OS

Cette application est destinée principalement à un utilisateur qui apprend le chinois mandarin avec une professeure particulière environ 2 à 3 fois par semaine.

Les cours sont principalement orientés vers :
- la conversation ;
- la compréhension ;
- le vocabulaire ;
- la grammaire ;
- la prononciation ;
- les corrections faites pendant les échanges.

Après les cours, la professeure fournit régulièrement des PDF contenant notamment :
- du vocabulaire ;
- des phrases ;
- des structures grammaticales ;
- des corrections ;
- des exercices ;
- des exemples ;
- des résumés du cours.

Les vrais PDF des cours sont disponibles dans :

`/source-materials/pdf/`

Ces fichiers constituent la matière première réelle de l'application.

---

# Règle absolue concernant les PDF

Les fichiers présents dans :

`/source-materials/pdf/`

sont en LECTURE SEULE.

Ne jamais :
- les modifier ;
- les renommer ;
- les déplacer ;
- les supprimer ;
- les écraser.

L'application peut créer ses propres copies ou représentations internes si nécessaire.

Les fichiers originaux doivent toujours rester intacts.

---

# Objectif principal du produit

Transformer chaque cours de chinois en connaissances réellement mémorisées et utilisables spontanément à l'oral.

La boucle fondamentale du produit est :

COURS
↓
PDF
↓
EXTRACTION
↓
ANALYSE IA
↓
CONNAISSANCES STRUCTURÉES
↓
VALIDATION UTILISATEUR
↓
RAPPEL ACTIF
↓
RÉPÉTITION ESPACÉE
↓
ÉCOUTE
↓
PRODUCTION ORALE
↓
DÉTECTION DES ERREURS
↓
RÉVISION CIBLÉE
↓
MÉMORISATION LONG TERME

---

# Ce que l'application n'est PAS

Chinese Learning OS n'est pas :

- un clone de Duolingo ;
- un simple lecteur PDF ;
- une simple application de flashcards ;
- un dictionnaire chinois ;
- un cursus générique de chinois ;
- une plateforme sociale ;
- une application HSK générique.

Le produit doit être construit autour des vrais cours de l'utilisateur.

---

# Philosophie produit

Optimiser pour la question :

> "Est-ce que l'utilisateur peut retrouver et utiliser spontanément cette connaissance ?"

et non :

> "Est-ce que l'utilisateur a déjà vu cette information ?"

La reconnaissance passive ne doit pas être confondue avec la maîtrise.

---

# Philosophie de développement

Priorités :

1. Produit fonctionnel.
2. Expérience utilisateur excellente.
3. Données fiables.
4. Architecture simple.
5. Fonctionnalités IA réellement utiles.
6. Maintenabilité.
7. Rapidité.
8. Qualité visuelle.
9. Tests.
10. Robustesse.

Éviter la complexité prématurée.

Ne pas construire d'infrastructure "enterprise" inutile pour une application personnelle.

---

# Travail autonome

Utiliser `TASKS.md` comme source de vérité pour l'avancement.

Pour chaque tâche :

1. Comprendre le besoin.
2. Inspecter le code existant.
3. Concevoir la solution la plus simple et robuste.
4. Implémenter.
5. Tester.
6. Exécuter le lint.
7. Exécuter le typecheck.
8. Corriger les problèmes.
9. Tester le parcours utilisateur concerné.
10. Mettre à jour TASKS.md.
11. Continuer vers la prochaine tâche.

Ne pas s'arrêter après avoir créé un prototype.

Ne pas considérer une fonctionnalité terminée simplement parce que le code existe.

Une fonctionnalité est terminée lorsqu'elle fonctionne réellement.

---

# Gestion des ambiguïtés

Lorsqu'une décision mineure n'est pas spécifiée :

choisir la solution :
- la plus simple ;
- la plus robuste ;
- la plus cohérente avec PRODUCT.md ;
- la plus facile à maintenir.

Ne pas interrompre inutilement le développement pour une décision qui peut être raisonnablement déduite des spécifications.

Documenter les décisions importantes dans :

`docs/DECISIONS.md`

---

# Analyse des PDF existants

Avant de construire le système d'import :

inspecter les PDF présents dans :

`/source-materials/pdf/`

Identifier :

- leur structure ;
- leur format ;
- les tableaux éventuels ;
- la manière dont le chinois est présenté ;
- la manière dont le pinyin est présenté ;
- la manière dont le français est présenté ;
- les corrections ;
- les exercices ;
- les titres ;
- les dates ;
- les variations entre différents cours.

Créer :

`docs/PDF_ANALYSIS.md`

avec les conclusions.

Construire ensuite l'importeur à partir de ces observations.

ATTENTION :

Ne jamais coder l'importeur uniquement pour les PDF existants.

Il doit pouvoir accepter les futurs PDF de la professeure.

---

# Langues

Interface utilisateur :

FRANÇAIS.

Contenu pédagogique :

- chinois simplifié ;
- pinyin ;
- français.

L'architecture ne doit pas empêcher l'ajout futur du chinois traditionnel.

---

# Principe UX fondamental

L'utilisateur ne devrait presque jamais devoir se demander :

> "Qu'est-ce que je dois réviser aujourd'hui ?"

Chinese Learning OS doit décider automatiquement quoi réviser.

Le CTA principal de l'application doit être :

# Commencer ma session

---

# Priorité au rappel actif

Lorsqu'une connaissance peut être testée par rappel actif :

ne jamais afficher la réponse avant que l'utilisateur ait essayé.

Exemple incorrect :

旅行 = voyager

"Tu t'en souviens ?"

Exemple correct :

"Comment dit-on « voyager » en chinois ?"

L'utilisateur répond.

Puis seulement ensuite afficher :

旅行
lǚxíng
voyager

---

# Les erreurs sont des données importantes

Une erreur utilisateur ne doit pas être jetée après l'exercice.

Elle doit pouvoir être enregistrée et utilisée pour améliorer les prochaines sessions.

Les erreurs récurrentes doivent augmenter la priorité des connaissances concernées.

---

# Provenance des connaissances

Toujours distinguer :

TEACHER
AI
USER

Une information générée par l'IA ne doit jamais être présentée comme si elle provenait de la professeure.

Les données issues directement des cours ont priorité.

---

# Définition du MVP terminé

Le MVP est considéré comme fonctionnel lorsqu'un utilisateur peut :

1. lancer l'application localement ;
2. importer un vrai PDF de cours ;
3. faire analyser le PDF ;
4. voir les informations extraites ;
5. corriger l'extraction ;
6. valider le cours ;
7. retrouver le cours dans l'historique ;
8. retrouver le vocabulaire extrait ;
9. retrouver les phrases ;
10. retrouver les points de grammaire ;
11. lancer une session quotidienne ;
12. effectuer des exercices de rappel actif ;
13. terminer une session ;
14. enregistrer ses résultats ;
15. générer automatiquement des erreurs ;
16. retrouver ses erreurs ;
17. avoir des révisions futures adaptées à ses performances ;
18. fermer puis relancer l'application sans perdre les données.

---

# Définition du MVP+

Après stabilisation du MVP :

- synthèse vocale chinoise ;
- exercices d'écoute ;
- microphone ;
- enregistrement audio ;
- transcription chinoise ;
- exercices de production orale ;
- feedback IA ;
- conversations IA.

---

# Critères de qualité obligatoires

Avant de considérer le projet terminé :

- le build doit fonctionner ;
- TypeScript ne doit produire aucune erreur ;
- le lint doit passer ;
- les tests doivent passer ;
- les parcours critiques doivent avoir des tests E2E ;
- les migrations doivent fonctionner depuis une base vide ;
- l'application doit fonctionner sans clé IA avec des messages d'erreur propres ;
- les états de chargement doivent exister ;
- les états vides doivent exister ;
- les erreurs doivent être correctement affichées ;
- l'interface mobile doit être utilisable ;
- aucun secret ne doit être commité ;
- `.env.example` doit exister ;
- README.md doit expliquer l'installation complète.

---

# Interdictions

Ne jamais :

- supprimer silencieusement des données ;
- inventer du contenu provenant supposément de la professeure ;
- modifier les PDF originaux ;
- exposer une clé API côté client ;
- marquer une tâche terminée sans vérification ;
- créer des boutons factices ;
- laisser des pages importantes vides ;
- simuler une fonctionnalité critique sans l'indiquer ;
- déclarer le projet terminé avec des TODO critiques.

---

# Fin du développement

Avant de déclarer l'application terminée :

1. repartir d'une base propre ;
2. installer les dépendances ;
3. créer la base ;
4. appliquer les migrations ;
5. lancer l'application ;
6. importer plusieurs vrais PDF ;
7. vérifier l'extraction ;
8. créer un cours ;
9. lancer une session ;
10. faire volontairement des erreurs ;
11. vérifier leur enregistrement ;
12. terminer la session ;
13. redémarrer l'application ;
14. vérifier la persistance ;
15. lancer tous les tests ;
16. lancer lint ;
17. lancer typecheck ;
18. lancer le build de production.

Ne déclarer le projet terminé que lorsque ces étapes fonctionnent.