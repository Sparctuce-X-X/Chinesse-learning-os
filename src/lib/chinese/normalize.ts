/**
 * Normalisation du texte extrait des PDF.
 *
 * Certains PDF encodent des caractères chinois avec des « radicaux » Unicode
 * (ex. ⾏ U+2F8F au lieu de 行, ⻋ U+2ECB au lieu de 车) : visuellement identiques,
 * mais incomparables avec le texte saisi. NFKC corrige les radicaux Kangxi (U+2F00–2FDF) ;
 * le bloc « supplément » (U+2E80–2EFF) nécessite une table.
 */
const RADICAL_SUPPLEMENT: Record<string, string> = {
  "⺟": "母", "⺠": "民", "⻄": "西", "⻅": "见", "⻆": "角", "⻈": "讠", "⻉": "贝",
  "⻊": "足", "⻋": "车", "⻑": "長", "⻓": "长", "⻔": "门", "⻘": "青", "⻚": "页",
  "⻛": "风", "⻜": "飞", "⻝": "食", "⻢": "马", "⻣": "骨", "⻤": "鬼", "⻥": "鱼",
  "⻦": "鸟", "⻨": "麦", "⻩": "黄", "⻬": "齐", "⻮": "齿", "⻰": "龙", "⻳": "龟",
};

const SUPPLEMENT_RE = /[\u2e80-\u2eff]/g;
const KANGXI_RE = /[\u2f00-\u2fdf]/g;

/** Ne touche qu'aux radicaux : la ponctuation chinoise pleine chasse (，。？) est conservée. */
export function normalizeExtractedText(s: string): string {
  return s
    .replace(KANGXI_RE, (c) => c.normalize("NFKC"))
    .replace(SUPPLEMENT_RE, (c) => RADICAL_SUPPLEMENT[c] ?? c);
}
