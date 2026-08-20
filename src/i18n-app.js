/**
 * Copy for the Next.js frontend.
 *
 * The Express site's strings live in src/i18n.js and are keyed to markup that
 * no longer exists on the new pages, so its keys could not simply be reused.
 * Rather than stand up a second translation system, these keys are merged into
 * the same `copy` object at load time (see the bottom of src/i18n.js) — one
 * dictionary, one `t()`, one place to add a language.
 *
 * Keys are namespaced `app.` so it stays obvious which side of the site a
 * string belongs to while both are alive.
 *
 * English is the fallback: `t()` drops back to `copy.en` for any key a
 * language is missing, so a partially translated language degrades to English
 * word by word instead of showing a raw key.
 */
const appCopy = {
  en: {
    "app.yourMarket": "your market",
    "app.home.metaTitle": "Checked deals in {country}",
    "app.home.metaDescription": "Check here before you buy. We compare price signal, product rating and seller confidence across {country} retailers, and only list what clears the bar.",
    "app.drop.metaDescription": "One checked pick a day in {country}, chosen on price signal, product rating and seller confidence.",

    "app.nav.dailyDrop": "Daily Drop",
    "app.header.askDelia": "Ask Delia",

    "app.home.eyebrow": "Every listing in {country}, checked before it is shown",
    "app.home.title": "Check here before you buy.",
    "app.home.lede": "We compare local prices, product quality and seller signals, so your first stop before buying is a smarter one.",
    "app.home.browse": "Browse checked deals",
    "app.home.howWeSelect": "How we select",
    "app.home.deliaHint": "Say what you need. Delia searches only the checked picks.",
    "app.home.alsoHere": "Also here",
    "app.home.dropTeaser": "One pick a day, put through the same checks. A new one lands every day at midnight UTC.",
    "app.home.seeDrop": "See the Daily Drop",
    "app.home.browseEyebrow": "Browse",
    "app.home.exploreCategories": "Explore categories",
    "app.home.seeAllDeals": "See all deals",
    "app.home.checkedCount": "{count} checked",
    "app.home.bestEyebrow": "Highest scoring",
    "app.home.bestTitle": "Best right now",
    "app.home.emptyTitle": "Checking today's picks",
    "app.home.emptyText": "We haven't published checked deals for this market yet. No sample prices or products are shown while we verify the catalog — check back shortly.",

    "app.signal.price": "Price signal",
    "app.signal.quality": "Product quality",
    "app.signal.seller": "Seller confidence",

    "app.drop.eyebrow": "One genuinely good deal in {country}, checked daily",
    "app.drop.title": "Daily Drop",
    "app.drop.lede": "One pick a day, put through the same three checks as everything else in the catalog. If nothing clears the bar, we say so rather than filling the slot.",
    "app.drop.landsDaily": "A new pick lands every day at midnight UTC. Today's was checked {checkedAt}.",
    "app.drop.pastDrops": "See past drops",
    "app.drop.checkedToday": "Checked today",
    "app.drop.todaysPick": "Today's pick",
    "app.drop.emptyTitle": "No drop published yet",
    "app.drop.emptyText": "We haven't published a checked pick for this market yet. No sample prices or products are shown while we verify the catalog.",

    "app.notSeller": "OneDailyDrop does not sell products. When you choose a deal, we send you to the local retailer.",

    "app.footer.tagline": "One genuinely good deal a day, chosen on price evidence, product feedback and seller reliability.",
    "app.footer.howThisWorks": "How this works",
    "app.footer.howWeSelect": "How we select deals",
    "app.footer.about": "About",
    "app.footer.privacy": "Privacy",
    "app.footer.terms": "Terms",
    "app.footer.contact": "Contact",
    "app.footer.affiliate": "Affiliate disclosure",
    "app.footer.legal": "Legal",
    "app.footer.country": "Country",
    "app.footer.copyright": "© {year} OneDailyDrop. Prices and availability are checked periodically and can change at the retailer at any time.",
  },

  es: {
    "app.yourMarket": "tu mercado",
    "app.home.metaTitle": "Ofertas verificadas en {country}",
    "app.home.metaDescription": "Consúltanos antes de comprar. Comparamos la señal de precio, la valoración del producto y la fiabilidad del vendedor entre los comercios de {country}, y solo listamos lo que supera el listón.",
    "app.drop.metaDescription": "Una selección verificada al día en {country}, elegida por señal de precio, valoración del producto y fiabilidad del vendedor.",

    "app.nav.dailyDrop": "Oferta del día",
    "app.header.askDelia": "Pregunta a Delia",

    "app.home.eyebrow": "Cada anuncio en {country}, verificado antes de mostrarse",
    "app.home.title": "Consúltanos antes de comprar.",
    "app.home.lede": "Comparamos precios locales, la calidad del producto y las señales del vendedor, para que tu primera parada antes de comprar sea más inteligente.",
    "app.home.browse": "Ver ofertas verificadas",
    "app.home.howWeSelect": "Cómo seleccionamos",
    "app.home.deliaHint": "Di lo que necesitas. Delia busca solo entre las selecciones verificadas.",
    "app.home.alsoHere": "También aquí",
    "app.home.dropTeaser": "Una selección al día, sometida a las mismas comprobaciones. Se publica cada día a medianoche UTC.",
    "app.home.seeDrop": "Ver la oferta del día",
    "app.home.browseEyebrow": "Explorar",
    "app.home.exploreCategories": "Explorar categorías",
    "app.home.seeAllDeals": "Ver todas las ofertas",
    "app.home.checkedCount": "{count} verificados",
    "app.home.bestEyebrow": "Mejor puntuación",
    "app.home.bestTitle": "Lo mejor ahora mismo",
    "app.home.emptyTitle": "Verificando las selecciones de hoy",
    "app.home.emptyText": "Todavía no hemos publicado ofertas verificadas para este mercado. No mostramos precios ni productos de ejemplo mientras verificamos el catálogo: vuelve en un rato.",

    "app.signal.price": "Señal de precio",
    "app.signal.quality": "Calidad del producto",
    "app.signal.seller": "Fiabilidad del vendedor",

    "app.drop.eyebrow": "Una oferta realmente buena en {country}, verificada a diario",
    "app.drop.title": "Oferta del día",
    "app.drop.lede": "Una selección al día, sometida a las mismas tres comprobaciones que el resto del catálogo. Si nada supera el listón, lo decimos en lugar de rellenar el hueco.",
    "app.drop.landsDaily": "Se publica una nueva selección cada día a medianoche UTC. La de hoy se verificó el {checkedAt}.",
    "app.drop.pastDrops": "Ver ofertas anteriores",
    "app.drop.checkedToday": "Verificado hoy",
    "app.drop.todaysPick": "La selección de hoy",
    "app.drop.emptyTitle": "Aún no hay oferta publicada",
    "app.drop.emptyText": "Todavía no hemos publicado una selección verificada para este mercado. No mostramos precios ni productos de ejemplo mientras verificamos el catálogo.",

    "app.notSeller": "OneDailyDrop no vende productos. Cuando eliges una oferta, te enviamos al comercio local.",

    "app.footer.tagline": "Una oferta realmente buena al día, elegida por evidencia de precio, opiniones del producto y fiabilidad del vendedor.",
    "app.footer.howThisWorks": "Cómo funciona",
    "app.footer.howWeSelect": "Cómo seleccionamos las ofertas",
    "app.footer.about": "Quiénes somos",
    "app.footer.privacy": "Privacidad",
    "app.footer.terms": "Términos",
    "app.footer.contact": "Contacto",
    "app.footer.affiliate": "Divulgación de afiliación",
    "app.footer.legal": "Legal",
    "app.footer.country": "País",
    "app.footer.copyright": "© {year} OneDailyDrop. Los precios y la disponibilidad se verifican periódicamente y pueden cambiar en el comercio en cualquier momento.",
  },

  fr: {
    "app.yourMarket": "votre marché",
    "app.home.metaTitle": "Offres vérifiées en {country}",
    "app.home.metaDescription": "Vérifiez ici avant d'acheter. Nous comparons le signal de prix, la note du produit et la fiabilité du vendeur chez les marchands en {country}, et ne listons que ce qui passe la barre.",
    "app.drop.metaDescription": "Une sélection vérifiée par jour en {country}, choisie sur le signal de prix, la note du produit et la fiabilité du vendeur.",

    "app.nav.dailyDrop": "Offre du jour",
    "app.header.askDelia": "Demander à Delia",

    "app.home.eyebrow": "Chaque annonce en {country}, vérifiée avant d'être affichée",
    "app.home.title": "Vérifiez ici avant d'acheter.",
    "app.home.lede": "Nous comparons les prix locaux, la qualité des produits et les signaux vendeur, pour que votre premier réflexe avant d'acheter soit le bon.",
    "app.home.browse": "Voir les offres vérifiées",
    "app.home.howWeSelect": "Notre méthode",
    "app.home.deliaHint": "Dites ce qu'il vous faut. Delia ne cherche que parmi les sélections vérifiées.",
    "app.home.alsoHere": "Également ici",
    "app.home.dropTeaser": "Une sélection par jour, soumise aux mêmes vérifications. Une nouvelle paraît chaque jour à minuit UTC.",
    "app.home.seeDrop": "Voir l'offre du jour",
    "app.home.browseEyebrow": "Parcourir",
    "app.home.exploreCategories": "Explorer les catégories",
    "app.home.seeAllDeals": "Voir toutes les offres",
    "app.home.checkedCount": "{count} vérifiés",
    "app.home.bestEyebrow": "Meilleurs scores",
    "app.home.bestTitle": "Le meilleur en ce moment",
    "app.home.emptyTitle": "Vérification des sélections du jour",
    "app.home.emptyText": "Nous n'avons pas encore publié d'offres vérifiées pour ce marché. Aucun prix ni produit d'exemple n'est affiché pendant que nous vérifions le catalogue — revenez d'ici peu.",

    "app.signal.price": "Signal de prix",
    "app.signal.quality": "Qualité du produit",
    "app.signal.seller": "Fiabilité du vendeur",

    "app.drop.eyebrow": "Une offre vraiment intéressante en {country}, vérifiée chaque jour",
    "app.drop.title": "Offre du jour",
    "app.drop.lede": "Une sélection par jour, soumise aux trois mêmes vérifications que le reste du catalogue. Si rien ne passe la barre, nous le disons plutôt que de remplir la case.",
    "app.drop.landsDaily": "Une nouvelle sélection paraît chaque jour à minuit UTC. Celle d'aujourd'hui a été vérifiée le {checkedAt}.",
    "app.drop.pastDrops": "Voir les offres précédentes",
    "app.drop.checkedToday": "Vérifié aujourd'hui",
    "app.drop.todaysPick": "La sélection du jour",
    "app.drop.emptyTitle": "Aucune offre publiée pour l'instant",
    "app.drop.emptyText": "Nous n'avons pas encore publié de sélection vérifiée pour ce marché. Aucun prix ni produit d'exemple n'est affiché pendant que nous vérifions le catalogue.",

    "app.notSeller": "OneDailyDrop ne vend pas de produits. Lorsque vous choisissez une offre, nous vous envoyons vers le marchand local.",

    "app.footer.tagline": "Une offre vraiment intéressante par jour, choisie sur des preuves de prix, les avis produit et la fiabilité du vendeur.",
    "app.footer.howThisWorks": "Comment ça marche",
    "app.footer.howWeSelect": "Comment nous sélectionnons",
    "app.footer.about": "À propos",
    "app.footer.privacy": "Confidentialité",
    "app.footer.terms": "Conditions",
    "app.footer.contact": "Contact",
    "app.footer.affiliate": "Divulgation d'affiliation",
    "app.footer.legal": "Mentions légales",
    "app.footer.country": "Pays",
    "app.footer.copyright": "© {year} OneDailyDrop. Les prix et la disponibilité sont vérifiés périodiquement et peuvent changer chez le marchand à tout moment.",
  },

  de: {
    "app.yourMarket": "Ihrem Markt",
    "app.home.metaTitle": "Geprüfte Angebote in {country}",
    "app.home.metaDescription": "Prüfen Sie hier, bevor Sie kaufen. Wir vergleichen Preissignal, Produktbewertung und Verkäuferzuverlässigkeit bei Händlern in {country} und listen nur, was die Prüfung besteht.",
    "app.drop.metaDescription": "Ein geprüftes Angebot pro Tag in {country}, ausgewählt nach Preissignal, Produktbewertung und Verkäuferzuverlässigkeit.",

    "app.nav.dailyDrop": "Tagesangebot",
    "app.header.askDelia": "Delia fragen",

    "app.home.eyebrow": "Jedes Angebot in {country}, geprüft bevor es erscheint",
    "app.home.title": "Prüfen Sie hier, bevor Sie kaufen.",
    "app.home.lede": "Wir vergleichen lokale Preise, Produktqualität und Verkäufersignale, damit Ihr erster Blick vor dem Kauf der klügere ist.",
    "app.home.browse": "Geprüfte Angebote ansehen",
    "app.home.howWeSelect": "Unsere Auswahl",
    "app.home.deliaHint": "Sagen Sie, was Sie brauchen. Delia sucht nur in den geprüften Angeboten.",
    "app.home.alsoHere": "Außerdem hier",
    "app.home.dropTeaser": "Ein Angebot pro Tag, denselben Prüfungen unterzogen. Ein neues erscheint täglich um Mitternacht UTC.",
    "app.home.seeDrop": "Zum Tagesangebot",
    "app.home.browseEyebrow": "Stöbern",
    "app.home.exploreCategories": "Kategorien entdecken",
    "app.home.seeAllDeals": "Alle Angebote ansehen",
    "app.home.checkedCount": "{count} geprüft",
    "app.home.bestEyebrow": "Höchste Bewertung",
    "app.home.bestTitle": "Aktuell am besten",
    "app.home.emptyTitle": "Die heutigen Angebote werden geprüft",
    "app.home.emptyText": "Für diesen Markt haben wir noch keine geprüften Angebote veröffentlicht. Solange wir den Katalog prüfen, zeigen wir keine Beispielpreise oder -produkte — schauen Sie bald wieder vorbei.",

    "app.signal.price": "Preissignal",
    "app.signal.quality": "Produktqualität",
    "app.signal.seller": "Verkäuferzuverlässigkeit",

    "app.drop.eyebrow": "Ein wirklich gutes Angebot in {country}, täglich geprüft",
    "app.drop.title": "Tagesangebot",
    "app.drop.lede": "Ein Angebot pro Tag, denselben drei Prüfungen unterzogen wie der übrige Katalog. Besteht keines die Prüfung, sagen wir das, statt den Platz zu füllen.",
    "app.drop.landsDaily": "Täglich um Mitternacht UTC erscheint ein neues Angebot. Das heutige wurde am {checkedAt} geprüft.",
    "app.drop.pastDrops": "Frühere Angebote ansehen",
    "app.drop.checkedToday": "Heute geprüft",
    "app.drop.todaysPick": "Das heutige Angebot",
    "app.drop.emptyTitle": "Noch kein Angebot veröffentlicht",
    "app.drop.emptyText": "Für diesen Markt haben wir noch kein geprüftes Angebot veröffentlicht. Solange wir den Katalog prüfen, zeigen wir keine Beispielpreise oder -produkte.",

    "app.notSeller": "OneDailyDrop verkauft keine Produkte. Wenn Sie ein Angebot wählen, leiten wir Sie zum lokalen Händler weiter.",

    "app.footer.tagline": "Ein wirklich gutes Angebot pro Tag, ausgewählt nach Preisbelegen, Produktbewertungen und Verkäuferzuverlässigkeit.",
    "app.footer.howThisWorks": "So funktioniert es",
    "app.footer.howWeSelect": "Wie wir auswählen",
    "app.footer.about": "Über uns",
    "app.footer.privacy": "Datenschutz",
    "app.footer.terms": "AGB",
    "app.footer.contact": "Kontakt",
    "app.footer.affiliate": "Affiliate-Hinweis",
    "app.footer.legal": "Rechtliches",
    "app.footer.country": "Land",
    "app.footer.copyright": "© {year} OneDailyDrop. Preise und Verfügbarkeit werden regelmäßig geprüft und können sich beim Händler jederzeit ändern.",
  },
};

module.exports = { appCopy };
