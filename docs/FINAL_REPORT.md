# Rapport final — Chinese Learning OS

Date : 27 septembre 2026.

## 1. Ce qui a été construit

Une application web personnelle, en français, qui transforme les PDF de cours de chinois en
connaissances révisées par rappel actif et répétition espacée, puis pratiquées à l'écoute et à l'oral.

Boucle complète, vérifiée de bout en bout sur les vrais PDF :

```
PDF → extraction (texte page par page) → analyse IA (ou extraction simple) → brouillon
→ validation / correction par l'utilisateur → connaissances (dédupliquées, avec provenance)
→ session quotidienne composée automatiquement → rappel actif → évaluation
→ erreurs enregistrées → priorité accrue → nouvelles révisions planifiées
→ écoute, oral (micro + transcription + feedback IA), conversation IA, préparation du cours suivant
```

## 2. Fonctionnalités

| Domaine | Fonctionnalités |
|---|---|
| Import | glisser-déposer, validation du fichier, copie interne (originaux jamais modifiés), extraction page par page, détection des pages images, PDF corrompu / scanné gérés, doublon de fichier signalé, analyse en arrière-plan avec étapes réelles, relance, extraction simple sans IA, abandon d'un import |
| Analyse IA | vocabulaire, pinyin, traductions, grammaire, phrases, corrections, exercices ; lecture visuelle des pages images et du pinyin en police ; mots surlignés ; confiance ; provenance champ par champ ; timeout, nouvelle tentative, JSON validé par Zod, repli heuristique |
| Validation | cartes éditables par section, éléments incertains signalés et filtrables, approuver / supprimer / restaurer / ajouter, « Tout approuver », doublons à rattacher ou séparer, sauvegarde automatique du brouillon |
| Cours | historique chronologique, fiche avec vocabulaire / grammaire / phrases / corrections / exercices / texte extrait, PDF consultable, « Réviser ce cours », ré-analyse |
| Thèmes | rangement automatique par sujet à chaque cours (réutilise les thèmes existants), progression par thème, « Réviser ce thème », rangement manuel, renommage, fusion, suppression sans perte, « Non classés » |
| Ressources externes | vidéo YouTube (sous-titres ou Whisper, lecteur interactif synchronisé), texte collé, lien d'article, fichier (PDF, Word, texte, sous-titres) ; découpage en mots, taux de mots connus, niveau HSK, mots utiles / rares avec contexte, « Je le connais », provenance « Ressource », priorité inférieure aux cours |
| Connaissances | liste, recherche hanzi / pinyin (avec ou sans tons) / français, filtres, fiche détaillée (origine avec page et extrait, provenance, exemples, maîtrise sur 5 dimensions, historique, erreurs, dernières réponses), modification, suspension |
| Révision | algorithme documenté (production > reconnaissance, oublis, retard, révision anticipée), priorités, nouveautés du cours récent, entrelacement, réapprentissage dans la session, reprise d'une session interrompue |
| Exercices | chinois → français, français → chinois (hanzi ou pinyin accepté), pinyin avec tons (saisie numérique acceptée), phrase à trou, reconstruction, traduction, grammaire à trous, écoute (audio → chinois, audio → sens) ; réponse jamais envoyée au navigateur avant la tentative ; auto-évaluation ou correction IA quand la comparaison n'est pas sûre |
| Session | « Commencer ma session », durée estimée, progression, raccourcis clavier, résumé final et prochaines révisions |
| Erreurs | création automatique et catégorisée (sens, caractère, pinyin, ton, ordre des mots, écoute, usage…), occurrences, récurrentes, résolution manuelle ou automatique (3 réussites), réouverture, sections À retravailler / Récurrentes / Récentes / Résolues, « Retravailler » |
| Progression | semaine (jours, révisions, minutes, oral, notions consolidées, taux de rappel, comparaison), activité sur 14 jours, rétention en production à 3 semaines, maîtrise par dimension |
| Écoute | voix neuronales Microsoft Edge par défaut, sans compte (6 voix) ou Google Chirp 3 HD en option (8 voix) ; cache disque, pré-génération à la validation d'un cours, repli sur la voix du navigateur), lecture lente, texte masqué avant la réponse, passage sans pénalité si l'audio manque |
| Oral | questions de la professeure + défis sur le vocabulaire faible / récent / en erreur + grammaire ; micro, enregistrement, réécoute, transcription modifiable, feedback IA (≤ 3 corrections, version corrigée écoutable), erreurs ciblées converties en `Mistake`, score d'usage |
| Conversation IA | 9 scénarios, connaissances ciblées (récentes, faibles, en erreur, grammaire), réponses texte ou voix, pinyin / traduction à la demande, feedback par message, bilan final, erreurs enregistrées |
| Préparation | « Préparer mon prochain cours » : mini-session (dernier cours, erreurs récurrentes, points faibles) + fiche « Pour ton prochain cours » |
| Paramètres | prénom, durée cible, nouveautés, révisions max, état de l'IA, test audio, emplacement des données |

## 3. Architecture finale

- **Next.js 16** (App Router, Turbopack), React 19, TypeScript strict, Tailwind 4, shadcn/ui, Zod 4.
- **Prisma 6 + SQLite** (schéma compatible PostgreSQL), 2 migrations.
- Couches : pages / actions serveur → services (`src/server/`) → logique métier pure (`src/lib/review`,
  `src/lib/pdf`, `src/lib/chinese`) → Prisma.
- Adaptateurs : `AIProvider` (claude-cli, anthropic, mock de test), `SpeechProvider` (navigateur).
- Détails : [`README.md`](../README.md#architecture), [`DECISIONS.md`](DECISIONS.md),
  [`SPACED_REPETITION.md`](SPACED_REPETITION.md), [`PDF_ANALYSIS.md`](PDF_ANALYSIS.md).

## 4. Tests effectués

### Automatisés (tous verts)

| Suite | Contenu | Résultat |
|---|---|---|
| Unitaires (Vitest) | pinyin, normalisation, gloses, planification, maîtrise, génération et évaluation d'exercices, composition de session | 41 tests |
| Intégration (Vitest, base dédiée recréée depuis zéro) | boucle complète sur le vrai PDF, repli sans IA, validation avec corrections, déduplication inter-cours, session / erreurs / replanification, écoute, abandon d'import, 2 PDF réels + 4 PDF synthétiques | 22 tests |
| E2E (Playwright, build de production, base recréée) | écran vide, refus d'un non-PDF, import → correction → validation, historique et recherche, session avec erreurs volontaires, session « Retravailler », persistance, paramètres, audit d'accessibilité WCAG 2 A/AA, parcours mobile (navigation, session, oral, conversation) | 11 tests |
| Lint (ESLint) / Typecheck (tsc) / Build | — | 0 erreur, 0 avertissement |

### Manuels, avec la vraie IA (Claude via l'abonnement)

- Import du PDF HSK de 22 pages : 133 s, 47 mots (dont ceux des pages images), 2 points de grammaire,
  28 phrases (dialogue complet), 10 exercices, avertissements pertinents.
- Import du PDF « 聊天 » : 85 s, 38 mots, 4 points de grammaire implicites, phrases correctement réparties élève / professeure.
- PDF synthétique scanné : mots et pinyin lus dans l'image.
- Ré-import du même cours : 62 connaissances rattachées, aucune dupliquée, corrections utilisateur préservées.
- Session réelle dans le navigateur (desktop et mobile) avec erreurs volontaires, oral en mode texte et au micro
  (périphérique simulé), conversation IA complète avec bilan.
- **Phase 21 depuis un environnement propre** (copie sans `node_modules`, base ni build) : `npm install`,
  `npm run setup`, build, démarrage, import du vrai PDF avec l'IA réelle, correction, validation,
  session avec une erreur volontaire, vérification de l'erreur et des prochaines révisions,
  **redémarrage de l'application et vérification de la persistance**, puis lint, typecheck, tests, E2E et build : tout est vert.
- Mode sans IA (`AI_PROVIDER=none`) : import par extraction simple, messages clairs sur toutes les pages concernées.

### Anomalies trouvées et corrigées pendant la QA (extraits)

- Traductions d'exemples attribuées à tort à la professeure → provenance distincte pour la traduction.
- Caractères radicaux Unicode (⾏, ⻋) dans certains PDF → normalisation à l'extraction.
- Gloses collées aux caractères et natures grammaticales du second PDF réel → heuristique généralisée.
- « Globalization » détecté comme français → règle `-ization` / `-isation`.
- Révision anticipée juste après une 1re réussite qui sautait à 3 jours → logique unifiée.
- Liste d'exercices d'oral recalculée sous l'utilisateur après envoi → liste figée côté client.
- Contrastes insuffisants (onglets, survol des boutons, couleur « Presque ») → corrigés, audit axe ajouté aux tests.

## 5. Fournisseurs externes

| Besoin | Fournisseur | Obligatoire ? |
|---|---|---|
| IA | Claude via le CLI Claude Code (abonnement) **ou** API Anthropic | non (mode sans IA disponible) |
| Voix naturelle | Microsoft Edge (lecture à voix haute, non officiel, sans compte) par défaut ; Google Chirp 3 HD en option | non (repli sur le navigateur) |
| Synthèse / reconnaissance vocales | API Web Speech du navigateur | non (dégradation propre) |
| Transcription de l'oral hors Chrome/Edge/Safari | Whisper small en local (transformers.js), modèle téléchargé une fois | non (`STT_PROVIDER=none` : saisie au clavier) |
| Polices | Geist via `next/font` (téléchargée au build) ; polices chinoises du système | — |

## 6. Variables d'environnement

`DATABASE_URL`, `DATA_DIR`, `AI_PROVIDER`, `CLAUDE_CLI_PATH`, `CLAUDE_CLI_MODEL_SMART`, `CLAUDE_CLI_MODEL_FAST`,
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_SMART`, `ANTHROPIC_MODEL_FAST`, `AI_LESSON_TIMEOUT_MS`, `TTS_PROVIDER`, `GOOGLE_TTS_API_KEY`, `STT_PROVIDER`, `WHISPER_MODEL` — voir [`.env.example`](../.env.example).

## 7. Limites restantes

- **Reconnaissance vocale et micro sur téléphone non vérifiés sur un vrai appareil** : l'enregistrement a été
  testé avec un micro simulé ; la transcription dépend du navigateur (Chrome, Edge, Safari), et le micro sur
  téléphone exige HTTPS (`npm run dev:https`). Ces deux points restent ouverts dans `TASKS.md`.
- **Voix Edge non officielle** : Microsoft peut couper ce service ; repli automatique sur la voix du navigateur.
  Le fournisseur Google (option) n'a été testé qu'avec l'API simulée.
- Deux PDF réels seulement : de nouveaux gabarits pourront demander d'ajuster l'extraction simple
  (l'analyse IA, elle, s'adapte).
- Sans IA, les pages en image ne sont pas lues et les réponses libres sont auto-évaluées.
- Pas d'analyse acoustique de la prononciation (tons) : seule la transcription est évaluée.
- Mono-utilisateur, sans authentification, prévu pour un usage local.
- La base de travail a été **réinitialisée** en fin de projet : les données de QA (réponses fictives, erreurs
  simulées, cours issus des PDF synthétiques) ne doivent pas polluer tes statistiques ni passer pour de vrais cours.
  Ta base est vide et prête : importe tes PDF depuis **Cours → Importer un cours**.

## 8. Idées pour la V2

1. **Prononciation** : visualisation du contour tonal, paires minimales de tons, feedback par syllabe.
2. **Transcription des visioconférences** (avec l'accord de la professeure) pour détecter automatiquement notions et corrections.
3. **Chinois traditionnel** (le schéma le permet : champs de texte indépendants).
4. **Mode hors ligne / PWA** pour réviser dans les transports sans réseau.
5. **Génération d'exemples supplémentaires** par l'IA pour les mots sans exemple (marqués IA).
6. **Export** (Anki, CSV) et sauvegarde automatique.
7. **Statistiques** de rétention par cours et par type d'erreur ; recommandations personnalisées.
8. **Écriture manuscrite** des caractères.
