const { categoryLabel, languageTag } = require("./i18n");

const clean = value => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const shorten = (value, limit = 110) => {
  const text = clean(value);
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trim()}…`;
};
const fill = (template, values) => String(template).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");

const content = {
  en: {
    eyebrow: "ONEDAILYDROP BUYING BRIEF",
    heading: "The useful details, without the sales-page noise",
    verifiedNote: "This brief uses verified listing data and OneDailyDrop calculations. Unknown specifications are not filled in or guessed.",
    quickVerdict: "Quick verdict",
    strengths: "Verified strengths",
    watchouts: "Watch-outs",
    discountStrength: "Current price is {discount}% below the retailer reference price.",
    ratingStrength: "Product rating is {rating}/5 across {reviews} reviews.",
    sellerStrength: "Seller feedback is {rating} positive.",
    freeDeliveryStrength: "The listing reports free delivery.",
    returnsStrength: "The listing reports accepted returns.",
    checkedStrength: "Current price and listing terms were checked with the retailer.",
    noReturnsWatch: "The listing says returns are not accepted.",
    paidDeliveryWatch: "Delivery is not listed as free and can change the final cost.",
    missingRatingWatch: "The marketplace did not supply a product rating for this listing.",
    noReferenceWatch: "No verified reference-price discount is shown; compare the current price directly.",
    checkoutWatch: "Confirm the exact model, condition and total at retailer checkout.",
    overview: "What this listing is",
    fit: "Who it may suit",
    why: "Why it made the list",
    offer: "What the current offer says",
    check: "What to check before buying",
    score: "How to read the Score",
    alternatives: "Alternatives worth comparing",
    related: "Related Drops",
    alternativesIntro: "These are other current {category} picks in {market}. They are alternatives to compare, not claims that the products have identical specifications.",
    compareOffers: "Compare current offers",
    compareOffersIntro: "These listings share a reliable product identifier. Price, delivery, returns and seller terms can still differ by store.",
    currentPrice: "Current price",
    retailer: "Retailer",
    seller: "Seller",
    delivery: "Delivery",
    returns: "Returns",
    availability: "Availability",
    viewOffer: "View offer",
    priceQuality: "Price quality",
    productQuality: "Product quality",
    reviewConfidence: "Review confidence",
    sellerReliability: "Seller reliability",
    demandUsefulness: "Demand & usefulness",
    shippingReturns: "Shipping & returns",
    seoTitle: "{title}: price, Score & buying guide | OneDailyDrop",
    seoDescription: "Check the current {store} price, OneDailyDrop Score, seller, delivery, returns and comparable {category} picks for {title}.",
    overviewText: "{title} is a {category} listing currently offered through {store}. OneDailyDrop follows this exact listing and its latest checked offer details instead of treating a broad product name as proof of features. {description} The store remains the final source for the model, included parts, condition and specifications shown at checkout.",
    noDescription: "The retailer feed does not provide a separate detailed description, so this brief does not add unverified features.",
    fitText: "This pick is most relevant to shoppers already comparing {category} products and willing to confirm that this exact model or configuration fits their needs. It can also help a buyer who wants price, product feedback and seller terms in one place before leaving for the store. Suitability still depends on details such as size, compatibility, quantity, color or included accessories when those details apply.",
    whyText: "{reason} That is the evidence behind the placement, not a paid ranking. The current OneDailyDrop Score is {score}/100 and measures the offer as a whole: price value, product evidence, review confidence, seller reliability, demand and buying terms. Affiliate commission does not add points and does not determine which item becomes the Daily Drop.",
    offerText: "At the latest check, the displayed price was {price}{reference}. The listing was shown as {availability}. It is sold by {seller}, with delivery described as {delivery} and returns described as {returns}. These terms can affect the real checkout value even when the headline price looks attractive, so OneDailyDrop keeps them beside the price rather than hiding them in a long description.",
    referencePrice: ", compared with a retailer reference price of {price} ({discount}% lower)",
    evidenceText: "Product feedback is {productEvidence}. Seller feedback is {sellerEvidence}. These are kept separate because a strong seller rating is not the same thing as a product rating. When a marketplace does not supply one of these fields, OneDailyDrop leaves it unknown rather than inventing a replacement.",
    productEvidence: "{rating}/5 from {reviews} product reviews",
    productEvidenceMissing: "not supplied for this listing",
    sellerEvidence: "{rating} with {reviews} seller ratings",
    sellerEvidenceRatingOnly: "{rating}",
    sellerEvidenceMissing: "not supplied for this listing",
    checkText: "Before ordering, open the store page and verify the exact model, quantity, condition and compatibility stated in the listing. Check the final total after delivery and tax, and make sure the return terms work for the kind of product being purchased. {caution} Prices and availability can change after OneDailyDrop's last check, so the store checkout always controls the final transaction.",
    cautionReturns: "This listing says returns are not accepted, which makes that verification especially important.",
    cautionDelivery: "Delivery is not listed as free, so include it when comparing the final cost with another offer.",
    cautionNeutral: "No additional restriction is inferred from missing retailer data.",
    scoreText: "The {score}/100 OneDailyDrop Score is an editorial offer score, not a customer star rating. Its strongest current component is {strongest} at {strongPoints}/{strongMax}; the lowest is {weakest} at {weakPoints}/{weakMax}. Each component uses the same published limits for every eligible offer. Price history is displayed separately and does not raise or lower this public Score.",
    verdict: "A {score}/100 offer from {store}, selected on the strength of {reason} Review the exact listing terms before checkout."
  },
  es: {
    eyebrow: "GUÍA DE COMPRA ONEDAILYDROP",
    heading: "Lo útil, sin el ruido de una página de venta",
    verifiedNote: "Esta guía usa datos verificados del anuncio y cálculos de OneDailyDrop. No completamos ni inventamos especificaciones desconocidas.",
    quickVerdict: "Veredicto rápido", strengths: "Puntos fuertes verificados", watchouts: "Aspectos a comprobar", discountStrength: "El precio actual está un {discount}% por debajo del precio de referencia.", ratingStrength: "El producto tiene {rating}/5 según {reviews} reseñas.", sellerStrength: "Las opiniones positivas del vendedor son del {rating}.", freeDeliveryStrength: "El anuncio indica entrega gratuita.", returnsStrength: "El anuncio indica que acepta devoluciones.", checkedStrength: "El precio y las condiciones se comprobaron con la tienda.", noReturnsWatch: "El anuncio indica que no acepta devoluciones.", paidDeliveryWatch: "La entrega no figura como gratuita y puede cambiar el coste final.", missingRatingWatch: "La plataforma no facilitó una valoración del producto.", noReferenceWatch: "No aparece un descuento de referencia verificado; compara directamente el precio actual.", checkoutWatch: "Confirma modelo, estado y total exactos al pagar en la tienda.",
    overview: "Qué es este anuncio",
    fit: "Para quién puede ser adecuado",
    why: "Por qué entró en la selección",
    offer: "Qué dice la oferta actual",
    check: "Qué comprobar antes de comprar",
    score: "Cómo interpretar la puntuación",
    alternatives: "Alternativas para comparar", related: "Ofertas relacionadas",
    alternativesIntro: "Estas son otras selecciones actuales de {category} en {market}. Son opciones para comparar, no productos con especificaciones necesariamente idénticas.",
    compareOffers: "Comparar ofertas actuales",
    compareOffersIntro: "Estos anuncios comparten un identificador de producto fiable. El precio, la entrega, las devoluciones y el vendedor pueden variar.",
    currentPrice: "Precio actual", retailer: "Tienda", seller: "Vendedor", delivery: "Entrega", returns: "Devoluciones", availability: "Disponibilidad", viewOffer: "Ver oferta",
    priceQuality: "Calidad del precio", productQuality: "Calidad del producto", reviewConfidence: "Confianza en las reseñas", sellerReliability: "Fiabilidad del vendedor", demandUsefulness: "Demanda y utilidad", shippingReturns: "Envío y devoluciones",
    seoTitle: "{title}: precio, puntuación y guía | OneDailyDrop",
    seoDescription: "Consulta el precio actual en {store}, la puntuación OneDailyDrop, vendedor, entrega, devoluciones y alternativas de {category} para {title}.",
    overviewText: "{title} es un anuncio de {category} ofrecido actualmente a través de {store}. OneDailyDrop sigue este anuncio concreto y sus últimos datos verificados, sin convertir un nombre general en una afirmación sobre sus funciones. {description} La tienda sigue siendo la fuente definitiva del modelo, piezas incluidas, estado y especificaciones que aparecen al pagar.",
    noDescription: "La fuente de la tienda no aporta una descripción detallada independiente, así que esta guía no añade funciones sin verificar.",
    fitText: "Esta selección es más útil para quien ya compara productos de {category} y está dispuesto a confirmar que este modelo o configuración responde a sus necesidades. También permite revisar precio, opiniones del producto y condiciones del vendedor antes de salir hacia la tienda. La idoneidad final depende de datos como tamaño, compatibilidad, cantidad, color o accesorios cuando correspondan.",
    whyText: "{reason} Esa es la evidencia de su posición, no una clasificación pagada. La puntuación OneDailyDrop actual es {score}/100 y valora la oferta completa: precio, evidencia del producto, reseñas, vendedor, demanda y condiciones de compra. La comisión de afiliación no añade puntos ni decide la oferta diaria.",
    offerText: "En la última comprobación, el precio mostrado era {price}{reference}. El anuncio figuraba como {availability}. Lo vende {seller}; la entrega se describe como {delivery} y las devoluciones como {returns}. Estas condiciones pueden cambiar el valor real al pagar, por eso aparecen junto al precio y no ocultas en una descripción larga.",
    referencePrice: ", frente a un precio de referencia de {price} ({discount}% menos)",
    evidenceText: "La evidencia del producto es {productEvidence}. La del vendedor es {sellerEvidence}. Se muestran por separado porque una buena valoración del vendedor no equivale a una valoración del producto. Si la plataforma no facilita uno de estos datos, OneDailyDrop lo deja como desconocido en lugar de inventarlo.",
    productEvidence: "{rating}/5 según {reviews} reseñas del producto", productEvidenceMissing: "no facilitada para este anuncio", sellerEvidence: "{rating} con {reviews} valoraciones del vendedor", sellerEvidenceRatingOnly: "{rating}", sellerEvidenceMissing: "no facilitada para este anuncio",
    checkText: "Antes de comprar, abre la página de la tienda y confirma el modelo exacto, cantidad, estado y compatibilidad del anuncio. Comprueba el total final con entrega e impuestos y asegúrate de que las devoluciones sean adecuadas para el producto. {caution} El precio y la disponibilidad pueden cambiar después de nuestra última comprobación; el pago de la tienda determina la transacción final.",
    cautionReturns: "El anuncio indica que no admite devoluciones, por lo que esta comprobación es especialmente importante.", cautionDelivery: "La entrega no figura como gratuita; inclúyela al comparar el coste final.", cautionNeutral: "No deducimos restricciones adicionales a partir de datos ausentes.",
    scoreText: "La puntuación OneDailyDrop de {score}/100 es una valoración editorial de la oferta, no una media de estrellas de clientes. Su componente más fuerte es {strongest}, con {strongPoints}/{strongMax}; el menor es {weakest}, con {weakPoints}/{weakMax}. Los mismos límites se aplican a todas las ofertas aptas. El historial de precios se muestra aparte y no modifica esta puntuación pública.",
    verdict: "Una oferta de {score}/100 en {store}, seleccionada por {reason} Comprueba los términos exactos antes de pagar."
  },
  fr: {
    eyebrow: "GUIDE D’ACHAT ONEDAILYDROP",
    heading: "L’essentiel, sans le bruit d’une page commerciale",
    verifiedNote: "Ce guide utilise les données vérifiées de l’annonce et les calculs OneDailyDrop. Les caractéristiques inconnues ne sont ni complétées ni inventées.",
    quickVerdict: "Verdict rapide", strengths: "Points forts vérifiés", watchouts: "Points à vérifier", discountStrength: "Le prix actuel est inférieur de {discount}% au prix marchand de référence.", ratingStrength: "La note produit est de {rating}/5 sur {reviews} avis.", sellerStrength: "Les évaluations positives du vendeur atteignent {rating}.", freeDeliveryStrength: "L’annonce indique une livraison gratuite.", returnsStrength: "L’annonce indique que les retours sont acceptés.", checkedStrength: "Le prix et les conditions ont été vérifiés auprès du marchand.", noReturnsWatch: "L’annonce indique que les retours ne sont pas acceptés.", paidDeliveryWatch: "La livraison n’est pas indiquée comme gratuite et peut modifier le coût final.", missingRatingWatch: "La place de marché n’a pas fourni de note produit.", noReferenceWatch: "Aucune remise de référence vérifiée n’est affichée ; comparez directement le prix actuel.", checkoutWatch: "Confirmez le modèle, l’état et le total exacts lors du paiement.", overview: "Ce qu’est cette annonce", fit: "À qui elle peut convenir", why: "Pourquoi elle a été retenue", offer: "Ce que dit l’offre actuelle", check: "À vérifier avant l’achat", score: "Comment lire le Score", alternatives: "Alternatives à comparer", related: "Sélections associées",
    alternativesIntro: "Voici d’autres sélections {category} actuelles en {market}. Ce sont des options de comparaison, pas des produits dont les caractéristiques seraient nécessairement identiques.", compareOffers: "Comparer les offres actuelles", compareOffersIntro: "Ces annonces partagent un identifiant produit fiable. Le prix, la livraison, les retours et le vendeur peuvent néanmoins différer.",
    currentPrice: "Prix actuel", retailer: "Marchand", seller: "Vendeur", delivery: "Livraison", returns: "Retours", availability: "Disponibilité", viewOffer: "Voir l’offre",
    priceQuality: "Qualité du prix", productQuality: "Qualité du produit", reviewConfidence: "Confiance dans les avis", sellerReliability: "Fiabilité du vendeur", demandUsefulness: "Demande et utilité", shippingReturns: "Livraison et retours",
    seoTitle: "{title} : prix, Score et guide d’achat | OneDailyDrop", seoDescription: "Consultez le prix {store}, le Score OneDailyDrop, le vendeur, la livraison, les retours et des alternatives {category} pour {title}.",
    overviewText: "{title} est une annonce {category} actuellement proposée via {store}. OneDailyDrop suit cette annonce précise et ses dernières données vérifiées, sans transformer un nom générique en promesse de fonctionnalités. {description} Le marchand reste la source finale pour le modèle, les éléments inclus, l’état et les caractéristiques affichées lors du paiement.",
    noDescription: "Le flux marchand ne fournit pas de description détaillée distincte ; ce guide n’ajoute donc aucune caractéristique non vérifiée.",
    fitText: "Cette sélection concerne surtout les acheteurs qui comparent déjà des produits {category} et peuvent confirmer que ce modèle ou cette configuration répond à leurs besoins. Elle permet aussi de réunir prix, avis produit et conditions du vendeur avant de quitter OneDailyDrop. L’adéquation finale dépend de détails comme la taille, la compatibilité, la quantité, la couleur ou les accessoires lorsqu’ils s’appliquent.",
    whyText: "{reason} Voilà ce qui justifie sa place, et non un classement payé. Le Score OneDailyDrop actuel est de {score}/100 et évalue l’offre complète : prix, données produit, avis, vendeur, demande et conditions d’achat. La commission d’affiliation n’ajoute aucun point et ne décide pas de la sélection quotidienne.",
    offerText: "Lors de la dernière vérification, le prix affiché était de {price}{reference}. L’annonce était indiquée comme {availability}. Elle est vendue par {seller}, avec une livraison décrite comme {delivery} et des retours décrits comme {returns}. Ces conditions peuvent modifier la valeur réelle au paiement ; elles restent donc visibles près du prix.",
    referencePrice: ", contre un prix marchand de référence de {price} ({discount}% de moins)",
    evidenceText: "Les données produit sont {productEvidence}. Les données vendeur sont {sellerEvidence}. Elles restent séparées, car une bonne note vendeur n’est pas une note produit. Si la place de marché ne fournit pas l’un de ces éléments, OneDailyDrop le laisse inconnu au lieu de le remplacer.",
    productEvidence: "{rating}/5 d’après {reviews} avis produit", productEvidenceMissing: "non fournies pour cette annonce", sellerEvidence: "{rating} avec {reviews} évaluations vendeur", sellerEvidenceRatingOnly: "{rating}", sellerEvidenceMissing: "non fournies pour cette annonce",
    checkText: "Avant de commander, ouvrez la page marchand et vérifiez le modèle exact, la quantité, l’état et la compatibilité indiqués. Contrôlez le total après livraison et taxes, ainsi que les conditions de retour. {caution} Le prix et la disponibilité peuvent changer après notre dernière vérification ; la page de paiement du marchand reste déterminante.",
    cautionReturns: "L’annonce indique que les retours ne sont pas acceptés, ce qui rend cette vérification particulièrement importante.", cautionDelivery: "La livraison n’est pas indiquée comme gratuite ; intégrez-la au coût final comparé.", cautionNeutral: "Aucune restriction supplémentaire n’est déduite de données absentes.",
    scoreText: "Le Score OneDailyDrop de {score}/100 est une évaluation éditoriale de l’offre, pas une moyenne d’étoiles clients. Sa composante la plus forte est {strongest}, à {strongPoints}/{strongMax} ; la plus basse est {weakest}, à {weakPoints}/{weakMax}. Les mêmes plafonds s’appliquent à toutes les offres admises. L’historique des prix est séparé et ne modifie pas ce Score public.",
    verdict: "Une offre notée {score}/100 chez {store}, retenue pour {reason} Vérifiez les conditions exactes avant le paiement."
  },
  de: {
    eyebrow: "ONEDAILYDROP KAUFÜBERSICHT", heading: "Die wichtigen Details ohne Verkaufsseiten-Lärm", verifiedNote: "Diese Übersicht nutzt geprüfte Angebotsdaten und OneDailyDrop-Berechnungen. Unbekannte Eigenschaften werden nicht ergänzt oder erraten.", quickVerdict: "Kurzfazit", strengths: "Geprüfte Stärken", watchouts: "Darauf achten", discountStrength: "Der aktuelle Preis liegt {discount}% unter dem Händler-Referenzpreis.", ratingStrength: "Die Produktbewertung beträgt {rating}/5 aus {reviews} Bewertungen.", sellerStrength: "Die positiven Verkäuferbewertungen betragen {rating}.", freeDeliveryStrength: "Das Angebot nennt kostenlose Lieferung.", returnsStrength: "Das Angebot nennt akzeptierte Rückgaben.", checkedStrength: "Preis und Angebotsbedingungen wurden beim Händler geprüft.", noReturnsWatch: "Laut Angebot sind Rückgaben ausgeschlossen.", paidDeliveryWatch: "Die Lieferung ist nicht als kostenlos angegeben und kann die Endkosten verändern.", missingRatingWatch: "Der Marktplatz hat keine Produktbewertung geliefert.", noReferenceWatch: "Es wird kein geprüfter Referenzrabatt angezeigt; vergleichen Sie den aktuellen Preis direkt.", checkoutWatch: "Prüfen Sie Modell, Zustand und Gesamtbetrag beim Händler-Checkout.", overview: "Was dieses Angebot ist", fit: "Für wen es passen kann", why: "Warum es ausgewählt wurde", offer: "Was das aktuelle Angebot sagt", check: "Vor dem Kauf prüfen", score: "So ist der Score zu lesen", alternatives: "Vergleichbare Alternativen", related: "Ähnliche Drops",
    alternativesIntro: "Dies sind weitere aktuelle {category}-Empfehlungen in {market}. Sie dienen zum Vergleich; identische Spezifikationen werden nicht behauptet.", compareOffers: "Aktuelle Angebote vergleichen", compareOffersIntro: "Diese Angebote teilen eine verlässliche Produktkennung. Preis, Lieferung, Rückgabe und Verkäuferbedingungen können dennoch abweichen.",
    currentPrice: "Aktueller Preis", retailer: "Händler", seller: "Verkäufer", delivery: "Lieferung", returns: "Rückgabe", availability: "Verfügbarkeit", viewOffer: "Angebot ansehen",
    priceQuality: "Preisqualität", productQuality: "Produktqualität", reviewConfidence: "Bewertungssicherheit", sellerReliability: "Verkäuferzuverlässigkeit", demandUsefulness: "Nachfrage und Nutzen", shippingReturns: "Lieferung und Rückgabe",
    seoTitle: "{title}: Preis, Score und Kaufratgeber | OneDailyDrop", seoDescription: "Prüfen Sie {store}-Preis, OneDailyDrop-Score, Verkäufer, Lieferung, Rückgabe und vergleichbare {category}-Angebote für {title}.",
    overviewText: "{title} ist ein aktuelles {category}-Angebot über {store}. OneDailyDrop verfolgt genau dieses Listing und seine zuletzt geprüften Angebotsdaten, ohne aus einem allgemeinen Produktnamen Eigenschaften abzuleiten. {description} Für Modell, Lieferumfang, Zustand und technische Angaben beim Checkout bleibt der Händler die maßgebliche Quelle.",
    noDescription: "Der Händler-Feed enthält keine separate ausführliche Beschreibung; deshalb ergänzt diese Übersicht keine ungeprüften Eigenschaften.",
    fitText: "Diese Auswahl ist besonders für Käufer relevant, die bereits {category}-Produkte vergleichen und prüfen können, ob genau dieses Modell oder diese Konfiguration zu ihrem Bedarf passt. Preis, Produktfeedback und Verkäuferbedingungen stehen vor dem Wechsel zum Händler an einem Ort. Die endgültige Eignung hängt gegebenenfalls von Größe, Kompatibilität, Menge, Farbe oder Zubehör ab.",
    whyText: "{reason} Diese Evidenz begründet die Platzierung, nicht eine bezahlte Rangfolge. Der aktuelle OneDailyDrop-Score beträgt {score}/100 und bewertet das Gesamtangebot: Preis, Produktdaten, Bewertungsvertrauen, Verkäufer, Nachfrage und Kaufbedingungen. Affiliate-Provisionen bringen keine Punkte und bestimmen nicht das Tagesangebot.",
    offerText: "Bei der letzten Prüfung lag der angezeigte Preis bei {price}{reference}. Das Angebot wurde als {availability} geführt. Verkäufer ist {seller}; die Lieferung ist als {delivery}, die Rückgabe als {returns} beschrieben. Diese Bedingungen können den tatsächlichen Checkout-Wert verändern und stehen deshalb sichtbar beim Preis.",
    referencePrice: ", gegenüber einem Händler-Referenzpreis von {price} ({discount}% niedriger)",
    evidenceText: "Die Produktdaten lauten {productEvidence}. Die Verkäuferdaten lauten {sellerEvidence}. Beides bleibt getrennt, denn eine gute Verkäuferbewertung ist keine Produktbewertung. Fehlt ein Wert auf dem Marktplatz, lässt OneDailyDrop ihn unbekannt, statt ihn zu ersetzen.",
    productEvidence: "{rating}/5 aus {reviews} Produktbewertungen", productEvidenceMissing: "für dieses Angebot nicht angegeben", sellerEvidence: "{rating} mit {reviews} Verkäuferbewertungen", sellerEvidenceRatingOnly: "{rating}", sellerEvidenceMissing: "für dieses Angebot nicht angegeben",
    checkText: "Öffnen Sie vor der Bestellung die Händlerseite und prüfen Sie Modell, Menge, Zustand und Kompatibilität des Listings. Vergleichen Sie den Endbetrag einschließlich Lieferung und Steuern und achten Sie auf passende Rückgabebedingungen. {caution} Preis und Verfügbarkeit können sich nach der letzten OneDailyDrop-Prüfung ändern; maßgeblich bleibt der Händler-Checkout.",
    cautionReturns: "Laut Angebot sind Rückgaben ausgeschlossen; deshalb ist diese Prüfung besonders wichtig.", cautionDelivery: "Die Lieferung ist nicht als kostenlos ausgewiesen und gehört in den Endkostenvergleich.", cautionNeutral: "Aus fehlenden Händlerdaten wird keine zusätzliche Einschränkung abgeleitet.",
    scoreText: "Der OneDailyDrop-Score von {score}/100 ist eine redaktionelle Angebotsbewertung und kein Kundenschnitt. Stärkste Komponente ist {strongest} mit {strongPoints}/{strongMax}; am niedrigsten liegt {weakest} mit {weakPoints}/{weakMax}. Für jedes zulässige Angebot gelten dieselben Grenzen. Der Preisverlauf wird getrennt gezeigt und verändert diesen öffentlichen Score nicht.",
    verdict: "Ein {score}/100-Angebot bei {store}, ausgewählt wegen {reason} Prüfen Sie vor dem Checkout die genauen Bedingungen."
  }
};

const scoreComponents = [
  ["price_quality", "priceQuality", 30],
  ["product_quality", "productQuality", 20],
  ["review_confidence", "reviewConfidence", 15],
  ["seller_reliability", "sellerReliability", 15],
  ["demand_usefulness", "demandUsefulness", 10],
  ["shipping_returns", "shippingReturns", 10]
];

function scoreBreakdown(product) {
  if (product?.score_breakdown && typeof product.score_breakdown === "object") return product.score_breakdown;
  try { return JSON.parse(product?.score_breakdown || "{}"); }
  catch { return {}; }
}

function money(value, currency, market, language) {
  const amount = number(value, NaN);
  if (!Number.isFinite(amount)) return "";
  try {
    return new Intl.NumberFormat(languageTag(market, language), {
      style: "currency",
      currency: String(currency || "USD").toUpperCase()
    }).format(amount);
  } catch {
    return `${currency || ""} ${amount.toFixed(2)}`.trim();
  }
}

function sellerRating(product) {
  const rating = number(product?.seller_rating, NaN);
  if (!Number.isFinite(rating) || rating <= 0) return "";
  const percent = rating <= 5 ? rating * 20 : rating;
  return `${Math.max(0, Math.min(100, percent)).toFixed(percent % 1 ? 1 : 0)}%`;
}

function createEditorialBrief(product, display, {
  language = "en",
  store = "Retailer",
  marketName = "",
  reason = ""
} = {}) {
  const lang = content[language] ? language : "en";
  const copy = content[lang];
  const title = shorten(display?.title || product?.title, 150);
  const category = categoryLabel(product?.category || "Deals", lang);
  const score = Math.round(number(display?.display_score ?? product?.score));
  const price = money(product?.current_price, product?.currency, product?.market, lang) || display?.display_current_price || copy.currentPrice;
  const originalPrice = money(product?.original_price, product?.currency, product?.market, lang);
  const discount = number(product?.original_price) > number(product?.current_price) && number(product?.current_price) > 0
    ? Math.round((1 - number(product.current_price) / number(product.original_price)) * 100)
    : 0;
  const retailerDescription = clean(display?.description || product?.description);
  const normalizedTitle = clean(title).toLowerCase();
  const usableDescription = retailerDescription.length >= 55 && retailerDescription.toLowerCase() !== normalizedTitle
    ? shorten(retailerDescription, 360)
    : copy.noDescription;
  const selectionReason = clean(reason || display?.display_selection_reason || product?.selection_reason);
  const shortReason = selectionReason || copy.noDescription;
  const seller = clean(product?.seller_name) || store;
  const delivery = clean(display?.display_shipping_summary || product?.shipping_summary) || "—";
  const returns = clean(display?.display_return_summary || product?.return_summary) || "—";
  const availability = clean(display?.display_availability || product?.availability) || "—";
  const reference = originalPrice && discount > 0
    ? fill(copy.referencePrice, { price: originalPrice, discount })
    : "";
  const rating = number(product?.rating, NaN);
  const reviews = Math.max(0, Math.round(number(product?.review_count)));
  const productEvidence = Number.isFinite(rating) && rating > 0 && reviews > 0
    ? fill(copy.productEvidence, {
      rating: rating.toFixed(1),
      reviews: reviews.toLocaleString(languageTag(product?.market, lang))
    })
    : copy.productEvidenceMissing;
  const sellerScore = sellerRating(product);
  const sellerReviews = Math.max(0, Math.round(number(product?.seller_feedback_count)));
  const sellerEvidence = sellerScore && sellerReviews
    ? fill(copy.sellerEvidence, { rating: sellerScore, reviews: sellerReviews.toLocaleString(languageTag(product?.market, lang)) })
    : sellerScore
      ? fill(copy.sellerEvidenceRatingOnly, { rating: sellerScore })
      : copy.sellerEvidenceMissing;
  const rawBreakdown = scoreBreakdown(product);
  const components = scoreComponents.map(([key, label, max]) => ({
    key,
    label: copy[label],
    points: Math.max(0, Math.min(max, Math.round(number(rawBreakdown[key]) * 10) / 10)),
    max
  }));
  const strongest = [...components].sort((a, b) => (b.points / b.max) - (a.points / a.max))[0];
  const weakest = [...components].sort((a, b) => (a.points / a.max) - (b.points / b.max))[0];
  const rawReturns = clean(product?.return_summary);
  const rawShipping = clean(product?.shipping_summary);
  const caution = /returns not accepted/i.test(rawReturns)
    ? copy.cautionReturns
    : rawShipping && !/^free shipping/i.test(rawShipping)
      ? copy.cautionDelivery
      : copy.cautionNeutral;
  const strengths = [
    discount > 0 ? fill(copy.discountStrength, { discount }) : "",
    Number.isFinite(rating) && rating > 0 && reviews > 0 ? fill(copy.ratingStrength, { rating: rating.toFixed(1), reviews: reviews.toLocaleString(languageTag(product?.market, lang)) }) : "",
    sellerScore ? fill(copy.sellerStrength, { rating: sellerScore }) : "",
    /^free shipping/i.test(rawShipping) ? copy.freeDeliveryStrength : "",
    rawReturns && !/returns not accepted/i.test(rawReturns) ? copy.returnsStrength : ""
  ].filter(Boolean);
  if (strengths.length < 2) strengths.push(copy.checkedStrength);
  const watchouts = [
    /returns not accepted/i.test(rawReturns) ? copy.noReturnsWatch : "",
    rawShipping && !/^free shipping/i.test(rawShipping) ? copy.paidDeliveryWatch : "",
    !(Number.isFinite(rating) && rating > 0 && reviews > 0) ? copy.missingRatingWatch : "",
    discount <= 0 ? copy.noReferenceWatch : "",
    copy.checkoutWatch
  ].filter(Boolean).slice(0, 3);
  const values = { title, category, store, market: marketName, score, reason: shortReason, price, reference, availability, seller, delivery, returns, description: usableDescription, productEvidence, sellerEvidence, caution };
  const sections = [
    { key: "overview", title: copy.overview, paragraphs: [fill(copy.overviewText, values)] },
    { key: "fit", title: copy.fit, paragraphs: [fill(copy.fitText, values)] },
    { key: "why", title: copy.why, paragraphs: [fill(copy.whyText, values), fill(copy.evidenceText, values)] },
    { key: "offer", title: copy.offer, paragraphs: [fill(copy.offerText, values)] },
    { key: "check", title: copy.check, paragraphs: [fill(copy.checkText, values)] },
    { key: "score", title: copy.score, paragraphs: [fill(copy.scoreText, {
      ...values,
      strongest: strongest.label,
      strongPoints: strongest.points,
      strongMax: strongest.max,
      weakest: weakest.label,
      weakPoints: weakest.points,
      weakMax: weakest.max
    })] }
  ];
  const plainText = [fill(copy.verdict, values), ...sections.flatMap(section => section.paragraphs)].join(" ");
  return {
    copy,
    eyebrow: copy.eyebrow,
    heading: copy.heading,
    verifiedNote: copy.verifiedNote,
    verdict: fill(copy.verdict, values),
    sections,
    components,
    facts: [
      [copy.currentPrice, price],
      [copy.retailer, store],
      [copy.seller, seller],
      [copy.delivery, delivery],
      [copy.returns, returns],
      [copy.availability, availability]
    ],
    strengths: strengths.slice(0, 4),
    watchouts,
    alternativesTitle: copy.alternatives,
    alternativesIntro: fill(copy.alternativesIntro, { category, market: marketName }),
    compareOffersTitle: copy.compareOffers,
    compareOffersIntro: copy.compareOffersIntro,
    seoTitle: shorten(fill(copy.seoTitle, { title: shorten(title, 24) }), 70),
    seoDescription: shorten(fill(copy.seoDescription, { title: shorten(title, 44), store, category }), 158),
    wordCount: plainText.split(/\s+/).filter(Boolean).length
  };
}

module.exports = { content, createEditorialBrief, scoreComponents };
