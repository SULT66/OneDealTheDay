// Only explicit counts are evidence. A missing count is unknown, not one.
function packCount(value) {
  const text = String(value || "");
  const match = text.match(/(?<![\d.])\b(\d{1,4})\s*[- ]?(?:packs?|pk|counts?|ct|pieces?|pcs)\b/i)
    || text.match(/\b(?:pack|set)\s+of\s+(\d{1,4})\b/i)
    || text.match(/(?<![\d.])\b(\d{1,4})\s*(?:pillows?|штук[аи]?|подушк[аи])\b/iu);
  const count = Number(match?.[1]);
  if (Number.isInteger(count) && count > 0 && count <= 1000) return count;
  if (/\b(?:single (?:pack|item)|one (?:pillow|item))\b|,\s*single\s*$/i.test(text)) return 1;
  return /\b(?:a pair of|pair of|one pair of)\b/i.test(text) ? 2 : null;
}

const COPY = {
  en: {original:'Original offer',different:'Different pack size - alternative',unknown:'Pack size unconfirmed - alternative',same:'Same pack size; confirm model and specifications',items:n=>`${n} item${n===1?'':'s'}`,unit:p=>`${p} per item`,summary:'The original offer is shown first. Compare pack quantities and the price per item; a lower pack price alone does not establish a better deal. Matching quantity does not confirm an identical product. Delivery charges may differ.'},
  es: {original:'Oferta original',different:'Otra cantidad - alternativa',unknown:'Cantidad sin confirmar - alternativa',same:'Misma cantidad; confirma modelo y especificaciones',items:n=>`${n} unidad${n===1?'':'es'}`,unit:p=>`${p} por unidad`,summary:'La oferta original aparece primero. Compara cantidades y precio por unidad; un paquete más barato no demuestra una mejor oferta. La misma cantidad no confirma un producto idéntico. El envío puede variar.'},
  fr: {original:'Offre d’origine',different:'Quantité différente - alternative',unknown:'Quantité non confirmée - alternative',same:'Même quantité ; vérifier modèle et caractéristiques',items:n=>`${n} article${n===1?'':'s'}`,unit:p=>`${p} par article`,summary:'L’offre d’origine apparaît en premier. Comparez la quantité et le prix unitaire ; un lot moins cher ne prouve pas une meilleure offre. Une quantité identique ne confirme pas un produit identique. Les frais de livraison peuvent varier.'},
  de: {original:'Ursprüngliches Angebot',different:'Andere Packungsgröße - Alternative',unknown:'Packungsgröße unbestätigt - Alternative',same:'Gleiche Menge; Modell und Ausstattung prüfen',items:n=>`${n} Stück`,unit:p=>`${p} pro Stück`,summary:'Das ursprüngliche Angebot steht zuerst. Vergleiche Stückzahl und Stückpreis; ein niedrigerer Packungspreis belegt kein besseres Angebot. Gleiche Stückzahl bestätigt kein identisches Produkt. Versandkosten können abweichen.'},
};

function quantityDetails(offer, language = 'en') {
  const copy = COPY[language] || COPY.en;
  const count = packCount(offer.title);
  const price = Number(offer.price_value);
  const unitPrice = count && offer.price_value != null && Number.isFinite(price) && price > 0 ? price/count : null;
  let label = count ? copy.items(count) : '';
  if(unitPrice != null && /^[A-Z]{3}$/.test(offer.currency || '')) {
    const formatted = new Intl.NumberFormat(language, {style:'currency',currency:offer.currency}).format(unitPrice);
    label += ' · ' + copy.unit(formatted);
  }
  return {pack_count:count,unit_price_value:unitPrice,quantity_label:label};
}

function focusedPackComparison(result, original, message, language='en') {
  if (!original || !result || result.turn_kind==='discussion' || result.scope==='social' || result.scope==='off_topic') return result;
  // A carried product ID must not hijack a later unrelated discovery request.
  if (!/\b(?:price|cheaper|worth|compare|precio|barato|prix|cher|preis|günstig)\b|цен[аыуе]|дешевле|сравни/iu.test(String(message || ''))) return result;
  const copy = COPY[language] || COPY.en;
  const count = packCount(original.title);
  const originalId = Number(original.catalog_product_id);
  const alternatives = (result.recommendations || []).filter(rec=>
    !(originalId && Number(rec.catalog_product_id)===originalId) && rec.url!==original.url);
  if (!(count>1 || alternatives.some(rec=>packCount(rec.title)>1))) return result;
  const annotate = (rec, isOriginal) => {
    const quantity = quantityDetails(rec,language);
    const comparison = isOriginal ? copy.original : quantity.pack_count==null || count==null ? copy.unknown : quantity.pack_count===count ? copy.same : copy.different;
    return {...rec,...quantity,original_offer:isOriginal,
      position_role:isOriginal?'original_offer':'alternative',lowest_price:false,lowest_new:false,
      pick_reason:'',badge:'',reason:'',note:comparison,
      // Folded offers have no title/count evidence. Keep them visible without
      // treating their amount as the price of the original pack.
      other_offers:(rec.other_offers || []).map(offer=>({...offer,quantity_note:copy.unknown}))};
  };
  return {...result,message:copy.summary,message_source:'template',result_state:'exact_matches',
    recommendations:[annotate(original,true),...alternatives.map(rec=>annotate(rec,false))],
    comparison:[],comparison_notes:[],follow_up:''};
}
module.exports = {packCount, quantityDetails, focusedPackComparison};
