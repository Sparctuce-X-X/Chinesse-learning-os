# Analyse des PDF de cours

Corpus analysé : `source-materials/pdf/` — **deux PDF réels**, de formats très différents :

| Fichier | Format | Pages |
|---|---|---|
| `L1 Dmn- Mobile Payment.pdf` | diaporama de manuel HSK 4 annoté (§1–8) | 22 |
| `16th-Dominique.pdf` (ajouté en cours de projet) | notes de conversation « 聊天 » tapées pendant le cours (§8 bis) | 2 |

L'importeur est volontairement conçu pour ne dépendre d'aucun gabarit précis
(voir « Conséquences pour l'importeur »). Des PDF synthétiques complètent les tests
(`tests/fixtures/synthetic/`).

---

## 1. Fiche technique

| Propriété | Valeur |
|---|---|
| Fichier | `L1 Dmn- Mobile Payment.pdf` |
| Pages | 22 |
| Format de page | 960 × 540 pt (16:9) → **diaporama exporté** (Keynote / PowerPoint → macOS Quartz PDFContext) |
| Taille | 3,4 Mo |
| Chiffré | Non |
| Polices | Roboto, Microsoft YaHei, SimSun, **AlibabaHealthFont20PY** (police « pinyin intégré ») |
| Couche texte | Oui, avec ToUnicode pour les polices CJK → le chinois s'extrait correctement |
| Métadonnées | Aucune date / titre exploitable (seulement la date de création du fichier) |

## 2. Structure du cours (type « manuel HSK 4 annoté »)

| Page(s) | Contenu | Texte extractible ? |
|---|---|---|
| 1 | Couverture : « HSK 4 - STANDARD COURSE », « 第1课 手机付款就可以 », « Lesson 2: Mobile payment is enough » | Oui |
| 2 | **Notes de la professeure prises pendant le cours** : mots nouveaux mélangés chinois / anglais / **français** (`胶带 Ruban adhésif`, `社团 - Association(ecole)`, `参观 - visiter`, `高铁 – TGV`), phrases de l'élève | Oui (mais le pinyin est absent du texte, voir §4) |
| 3–4 | Échauffement : questions de discussion (chinois + anglais entre parenthèses), liens YouTube | Oui |
| 5–9 | **Texte 1 (课文一)** : dialogue en bulles, personnages 收银员 / 田梦 / 冯尚德, mots-clés **surlignés en rouge** | **Non : ce sont des images** (8 caractères de texte : « 课文一 Note: ») |
| 10–11 | **Vocabulaire (生词一 / 生词二)** : tableau à 3 colonnes `生词 (Word)` / `拼音 (Pinyin)` / `英文 (English)` | Oui : tableau très propre |
| 12 | Procédure (5 étapes numérotées chinois / anglais) + « Practice: » vide | Oui |
| 13–14 | **Grammaire (语法)** : `只要…就…`, `万一` avec « Meaning », « Structure », exemple, traduction anglaise, puis **Practice** (phrase produite par l'élève) | Oui |
| 15 | Discussion avec 4 situations illustrées | Oui |
| 16–20 | **Texte 2 (课文二 5-5, 5-6)** : questions de compréhension avec mots-indices entre parenthèses `（先，然后，再）` | Partiellement (questions oui, supports images non) |
| 21 | Tableau comparatif 3 colonnes (mobile / cash / carte : avantages / inconvénients) | Oui, mais l'ordre de lecture des colonnes est mélangé |
| 22 | Résumé / consigne finale | Oui |

## 3. Tableaux

- **Tableau de vocabulaire** (p. 10–11) : 3 colonnes Hanzi / Pinyin / Anglais.
  `pdftotext -layout` et pdf.js restituent une ligne par entrée :
  `付款            fù kuǎn       to pay`.
  C'est le format le plus fiable du cours → une **extraction heuristique locale** est
  possible sans IA.
- **Tableau comparatif** (p. 21) : colonnes rendues entrelacées par l'extraction texte
  → nécessite l'IA ou la vision.
- Aucun tableau n'est balisé (PDF non « tagged »).

## 4. Chinois, pinyin, traductions

- **Chinois** : simplifié uniquement. Bien encodé (Unicode) dans la couche texte.
- **Pinyin** :
  - dans les tableaux de vocabulaire : syllabes **séparées par des espaces**, avec
    diacritiques (`yín háng kǎ`, `jī hū`) ;
  - dans les notes de la professeure (p. 2) : pinyin affiché **au-dessus des caractères**
    grâce à une police à pinyin intégré (AlibabaHealthFont20PY). Visuellement présent,
    mais **absent de la couche texte** ; seule la lecture visuelle de la page permet de
    le récupérer comme donnée « Professeure » ;
  - ailleurs : pas de pinyin.
- **Langue de traduction** : **anglais** dans le support de cours (tableaux, grammaire,
  questions). Le **français** n'apparaît que dans les notes libres de la professeure
  (p. 2 : `Ruban adhésif`, `visiter`, `Association(ecole)`, `TGV`).
  → L'interface est en français, mais les gloses « Professeure » sont souvent en anglais.
  Une traduction française générée doit être marquée **IA**.
- **Accents français** : correctement encodés (`adhésif`).

## 5. Corrections

- Pas de section « Corrections » explicite dans ce PDF.
- Les corrections implicites se trouvent :
  - dans les notes de cours (p. 2 : phrases de l'élève reformulées, ex.
    `如果是和隐私相关，欧洲的法律比较严格`) ;
  - dans les zones « Practice: » (p. 13 : `只要不带伞，就会下雨` est une phrase produite
    en cours, sémantiquement bancale : c'est probablement une phrase de l'élève et non un modèle).
- **Règle** : une phrase de la zone « Practice » ne doit pas être présentée comme un
  modèle de la professeure sans validation. L'extraction la marque
  `origin = STUDENT_PRACTICE` avec une confiance moyenne ou faible.

## 6. Exercices

- Questions de discussion (p. 3–4, 15, 22).
- Questions de compréhension avec mots-indices (p. 17, 20).
- Exercice à compléter (p. 14 : `B: 现在是下班时间，__________________？`).
- Zones « Practice » vides ou remplies en cours.

## 7. Titres et dates

- Titre en chinois (`手机付款就可以`) + titre anglais (`Mobile payment is enough`)
  + numéro de leçon **incohérent** (`第1课` vs `Lesson 2`) + nom de fichier `L1 Dmn- …`.
- **Aucune date de cours dans le contenu.** Seule la date de création du PDF
  (métadonnée `CreationDate`, ici le 7 septembre 2026) peut servir de valeur par défaut.
  → La date doit être **modifiable** à la validation.

## 8. Cas difficiles identifiés

1. Pages entièrement en image (texte des dialogues) → extraction texte = vide.
2. Pinyin dans une police à pinyin intégré → invisible dans le texte.
3. Mélange de 3 langues dans une même ligne (`White board白板在我的公寓，你不需要胶带Ruban adhésif.`).
4. Séparateurs variés entre mot et sens : `-`, `–`, espace, collé.
5. Tableaux multi-colonnes dont l'ordre de lecture est cassé.
6. Numérotation de leçon incohérente, absence de date.
7. Phrases d'élève potentiellement fautives mêlées aux exemples de la professeure.
8. Mots surlignés en rouge (information pédagogique portée uniquement par la couleur).

## 8 bis. Second format réel : notes de conversation « 聊天 » (`16th-Dominique.pdf`)

| Propriété | Valeur |
|---|---|
| Pages | 2, diaporama 16:9 (même outil que le premier PDF, créé le 25/09/2026) |
| Titre | « 聊天 » (conversation) sur chaque page ; aucune date dans le contenu ; « 16th » dans le nom du fichier = numéro de cours |
| Couche texte | complète (aucune page image) |
| Pinyin | au-dessus de **tous** les caractères, via la police à pinyin intégré (AlibabaHealthFont20PY) → absent du texte extrait, visible uniquement à la lecture visuelle |
| Mise en valeur | surlignage jaune des mots nouveaux, caractères entourés en rouge (化, 有/无, 时), mots en rouge ou en bleu |

Contenu :
- **p. 1** : phrases de l'élève notées pendant la conversation (voyage, salaire, AirPods), puis
  phrases de la professeure sur un sujet de discussion (« 有钱人的底层逻辑 »). Les mots nouveaux
  sont glosés **collés aux caractères**, sans séparateur : `庆祝celebrate`, `逻辑logic`,
  `连锁店chain store`, `线形的Linear`.
- **p. 2** : liste de vocabulaire dense, plusieurs entrées par ligne, gloses anglaises **et françaises**,
  avec nature grammaticale : `标准-adj./n.standard`, `限制-v./n. limite`, `有限- limité`, `无限- Infini`,
  `化-change object /people to become another status`, `薪水=工资salary`, `全球化- Globalization …`.

Différences avec le premier format :
- pas de tableaux ni de sections `生词 / 语法` : tout est en notes libres ;
- gloses collées aux mots dans les phrases ;
- natures grammaticales (`v.`, `adj./n.`) à séparer de la glose ;
- faute de frappe de la professeure (`我么` pour `我们`) : l'IA la signale dans les avertissements ;
- la grammaire n'est pas annoncée : elle est implicite (suffixe 化, 把…制作成…, 替 + personne + verbe).

Adaptations faites à l'importeur après ce PDF :
- extraction simple : gloses collées (dernier mot du segment chinois via `Intl.Segmenter`, en excluant
  les particules comme 的/个), nature grammaticale extraite dans `partOfSpeech`, gloses suivies de « … » ;
- détection de langue : `-ization` = anglais, `-isation` = français ;
- titre chinois : les phrases ne sont plus prises pour des titres.
Résultat sans IA : 27 mots corrects (contre 12 avant). Avec l'IA (85 s) : 38 mots, 4 points de grammaire
implicites, 14 phrases correctement réparties entre élève et professeure.

## 9. Variations attendues pour les futurs PDF

Non observables avec un seul fichier, mais anticipées :
- autres leçons du même manuel (même gabarit) ;
- PDF de notes pures (texte libre, sans diaporama) ;
- gloses en français ;
- PDF scannés (aucune couche texte) ;
- PDF très courts (une page de corrections).

---

## 10. Stratégie d'extraction retenue

Pipeline en deux niveaux, **indépendant du gabarit** :

1. **Extraction locale (toujours exécutée, sans IA)** avec `pdfjs-dist` côté serveur :
   - texte **par page** (numéro de page conservé) ;
   - reconstruction des lignes à partir des positions (x, y) pour garder les colonnes
     de tableaux ;
   - détection des pages « pauvres en texte » (probablement des images) ;
   - métadonnées (date de création, nombre de pages) ;
   - détection des PDF corrompus / chiffrés / sans texte.
   Le texte extrait est stocké en base (`SourcePage`) : on ne perd jamais le travail si
   l'IA échoue.

2. **Analyse IA structurée (si un fournisseur est disponible)** :
   - fournisseur par défaut : **Claude via le CLI `claude -p`** (abonnement Claude de
     l'utilisateur, pas de coût API). Le CLI reçoit le chemin du PDF copié et peut le
     **lire visuellement** (pages images, pinyin en police intégrée, mots en rouge) en
     plus du texte extrait ;
   - option : API Anthropic avec clé (`ANTHROPIC_API_KEY`), PDF envoyé comme document ;
   - sortie contrainte par un **JSON Schema** (`--json-schema`) puis **validée par Zod** ;
   - chaque champ porte sa provenance : `TEACHER` (lu dans le PDF) ou `AI` (déduit,
     traduit ou complété) + une confiance `HIGH | MEDIUM | LOW`.

3. **Repli heuristique (sans IA)** : parseur local des lignes
   `汉字 + pinyin accentué + glose` (tableaux de vocabulaire, notes `词 - sens`),
   et des blocs `语法 / Structure / Meaning`. Résultat marqué « extraction simple,
   à vérifier ». Il permet d'utiliser l'application sans aucun fournisseur IA.

Dans tous les cas, l'utilisateur **valide et corrige** avant la création des connaissances.

Test de faisabilité réalisé : `claude -p` avec l'outil Read limité aux pages 5–9 a
restitué les 29 répliques du dialogue (pages 100 % images) et les 11 mots surlignés en
rouge, en environ 27 s.

## 11. Conséquences pour l'importeur

- Ne jamais supposer l'existence de sections nommées (`生词`, `语法`…) : elles aident
  l'heuristique mais ne sont pas requises.
- Gloses : champs distincts `french` et `english`, chacun avec provenance.
  Les exercices utilisent le français s'il existe, sinon l'anglais (affiché comme tel).
- Date du cours : proposée depuis les métadonnées, puis modifiable.
- Pages images signalées à l'utilisateur quand aucune IA n'est disponible
  (« 5 pages semblent être des images : leur contenu n'a pas pu être lu »).
- Les originaux ne sont jamais ouverts en écriture : l'import copie le fichier dans
  `data/uploads/`.
