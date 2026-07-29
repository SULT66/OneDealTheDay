const languageDefinitions = {
  en: { code: "en", label: "English" },
  es: { code: "es", label: "Español" },
  fr: { code: "fr", label: "Français" },
  de: { code: "de", label: "Deutsch" }
};

const marketLanguages = {
  us: ["en", "es"],
  ca: ["en", "fr"],
  uk: ["en"],
  fr: ["fr", "en"],
  de: ["de", "en"]
};

const defaultLanguages = {
  us: "en",
  ca: "en",
  uk: "en",
  fr: "fr",
  de: "de"
};

const marketNames = {
  en: { us: "United States", ca: "Canada", uk: "United Kingdom", fr: "France", de: "Germany" },
  es: { us: "Estados Unidos", ca: "Canadá", uk: "Reino Unido", fr: "Francia", de: "Alemania" },
  fr: { us: "États-Unis", ca: "Canada", uk: "Royaume-Uni", fr: "France", de: "Allemagne" },
  de: { us: "Vereinigte Staaten", ca: "Kanada", uk: "Vereinigtes Königreich", fr: "Frankreich", de: "Deutschland" }
};

const copy = {
  en: {
    "brand.tagline": "Check here before you buy.",
    "brand.seoTagline": "The Best Deals. Every Day.",
    "language.label": "Language",
    "country.label": "Country",
    "search.placeholder": "What are you thinking of buying?",
    "search.short": "Search deals",
    "search.clear": "Clear search",
    "nav.primary": "Primary navigation",
    "nav.today": "Today's Drop",
    "nav.todayShort": "Today",
    "nav.more": "9 More Worth Seeing",
    "nav.categories": "Categories",
    "nav.trending": "Trending",
    "nav.archive": "Past Drops",
    "nav.check": "How We Check",
    "nav.about": "About",
    "nav.subscribe": "Get the daily drop",
    "menu.open": "Open menu",
    "menu.close": "Close menu",
    "theme.dark": "Dark",
    "theme.light": "Light",
    "theme.toDark": "Switch to dark mode",
    "theme.toLight": "Switch to light mode",
    "back.top": "Back to top",
    "home.eyebrow": "ONE GENUINELY GOOD DEAL, CHECKED DAILY",
    "home.eyebrowMarket": "ONE GENUINELY GOOD DEAL IN {country}, CHECKED DAILY",
    "home.title": "Check here<br><span>before you buy.</span>",
    "home.intro": "We compare the price, product quality and seller signals - so your first stop before buying is a smarter one.",
    "home.introMarket": "We compare local {country} prices, product quality and seller signals, so your first stop before buying is a smarter one.",
    "home.marketNote": "Deals, currency and retailers are selected automatically from your IP location: {country}.",
    "home.modelNote": "OneDailyDrop does not sell products. When you choose a deal, we send you to the local retailer.",
    "home.seeToday": "See today's drop",
    "home.getTomorrow": "Get tomorrow's drop",
    "home.priceSignal": "Price signal",
    "home.productQuality": "Product quality",
    "home.sellerConfidence": "Seller confidence",
    "home.nextDrop": "Next drop",
    "home.preparing": "Today's selection is being prepared",
    "home.unavailable": "No featured drop is available yet.",
    "home.featured": "TODAY'S #1 PICK",
    "home.makeHabit": "MAKE IT YOUR DAILY CHECK",
    "home.oneUseful": "One useful drop. In the categories you care about.",
    "home.chooseInterests": "Choose your interests and get the best new pick without searching through endless sale pages.",
    "home.shopFor": "What do you shop for?",
    "home.chooseCategory": "Please choose at least one category.",
    "home.email": "Email address",
    "home.subscribe": "Get my Daily Drop",
    "home.noSpam": "No spam. Unsubscribe anytime.",
    "home.moreEyebrow": "MORE SMART PICKS",
    "home.additional": "{count} additional products",
    "home.noMatch": "No products match that search.",
    "home.scoreEyebrow": "THE ONEDAILYDROP SCORE",
    "home.scoreTitle": "A simple score with visible logic.",
    "home.scoreIntro": "Every pick is judged using the same six-part framework.",
    "home.methodology": "Read our full methodology →",
    "home.priceQuality": "Price quality",
    "home.reviewConfidence": "Review confidence",
    "home.sellerReliability": "Seller reliability",
    "home.demandUsefulness": "Demand & usefulness",
    "home.shippingReturns": "Shipping & returns",
    "home.pastEyebrow": "PAST DAILY PICKS",
    "home.yesterday": "Yesterday's Drops",
    "home.historyHabit": "A habit needs a history",
    "home.popular": "POPULAR RIGHT NOW",
    "home.trending": "Trending Drops",
    "home.savings": "BIGGEST SAVINGS",
    "home.priceDrops": "Price Drops",
    "home.added": "JUST ADDED",
    "home.newDrops": "New Drops",
    "home.promise": "THE ONEDAILYDROP PROMISE",
    "home.lessScrolling": "Less scrolling. Better buying decisions.",
    "home.oneWinner": "One clear winner",
    "home.oneWinnerText": "One Daily Drop stays at the center. Everything else is secondary.",
    "home.reasons": "Reasons you can inspect",
    "home.reasonsText": "We explain why the price, product and seller earned attention.",
    "home.transparent": "Transparent monetization",
    "home.transparentText": "Affiliate commissions never change your price or decide our selection.",
    "seo.homeTitle": "Best Daily Deals in {country} | OneDailyDrop",
    "seo.homeDescription": "OneDailyDrop checks local prices, product quality and seller signals to find one strong daily deal in {country}, plus nine more products worth seeing.",
    "product.retailer": "Retailer",
    "product.deals": "Deals",
    "product.verified": "VERIFIED DEAL",
    "product.editorPick": "EDITOR'S PICK",
    "product.trending": "TRENDING",
    "product.popular": "POPULAR PICK",
    "product.availabilitySoon": "Retailer availability coming soon",
    "product.priceChecked": "Price checked {date}",
    "product.priceVerified": "Price recently verified",
    "product.retailerPrice": "Retailer price",
    "product.currentPrice": "Current price",
    "product.checkPrice": "Check price",
    "product.why": "Why we picked it:",
    "product.reviews": "reviews",
    "product.score": "Score",
    "product.save": "SAVE {percent}%",
    "product.off": "{percent}% off",
    "product.viewDetails": "VIEW DETAILS",
    "product.viewDealAt": "VIEW DEAL AT {store}",
    "product.priceHistory": "PRICE HISTORY",
    "product.offerDetails": "Offer details",
    "product.soldBy": "Sold by",
    "product.delivery": "Delivery",
    "product.returns": "Returns",
    "product.confirmRetailer": "Confirm at retailer",
    "product.retailerPolicy": "See retailer policy",
    "product.selectedFallback": "Picked for its price, shopper feedback and overall value.",
    "product.demoFallback": "Chosen for clear everyday usefulness and straightforward features.",
    "product.ratingReason": "{rating}-star rating",
    "product.reviewsReason": "{count} reviews",
    "product.scoreReason": "{score}/100 OneDailyDrop score",
    "product.discountReason": "{percent}% verified discount",
    "search.results": "Search results",
    "search.found": "Found {count} products",
    "search.products": "{count} products",
    "form.validEmail": "Enter a valid email address.",
    "form.chooseCategory": "Choose at least one category before subscribing.",
    "form.saving": "Saving your preferences…",
    "form.failed": "Could not subscribe.",
    "form.subscribed": "You're subscribed to the Daily Drop.",
    "form.subscribedEmail": "You're subscribed. Check your inbox for confirmation.",
    "load.failed": "Could not load today's selections",
    "footer.about": "About",
    "footer.contact": "Contact",
    "footer.privacy": "Privacy",
    "footer.terms": "Terms",
    "footer.affiliate": "Affiliate Disclosure",
    "footer.editorial": "Editorial Policy",
    "footer.selection": "How We Select Deals",
    "footer.price": "Price Disclaimer",
    "footer.disclosure": "We independently select featured products. OneDailyDrop may earn a commission when you purchase through our links, at no extra cost to you. Prices and availability may change.",
    "page.home": "Home",
    "page.brands": "Brands",
    "page.products": "Products",
    "page.averagePrice": "Average price",
    "page.averageRating": "Average rating",
    "page.averageDiscount": "Average discount",
    "page.viewDetails": "View details",
    "page.popularBrands": "Popular Brands",
    "page.pastDrops": "Past Drops",
    "page.searchDeals": "Search deals",
    "page.backToday": "Back to today’s drop",
    "page.notFoundTitle": "This drop got away.",
    "page.notFoundText": "That page does not exist or may have moved. Let’s get you back to the deals.",
    "page.whyPicked": "Why we picked it",
    "page.customerRating": "Customer rating",
    "page.priceHistory": "Price history",
    "page.low30": "30-day tracked low",
    "page.low90": "90-day tracked low",
    "page.lowAll": "All-time tracked low",
    "page.availability": "Availability",
    "page.priceChecked": "Price checked",
    "page.finalPrice": "Final price is confirmed on the retailer website.",
    "page.productsChecked": "Products checked",
    "page.currentRange": "Current price range",
    "page.archivePreparing": "The archive is being prepared.",
    "page.bestCategoryDeals": "Best {category} Deals",
    "page.categoryDescription": "Browse the best {category} deals available in {country}, selected by OneDailyDrop."
  },
  es: {
    "brand.tagline": "Míralo aquí antes de comprar.",
    "brand.seoTagline": "Las mejores ofertas. Todos los días.",
    "language.label": "Idioma",
    "country.label": "País",
    "search.placeholder": "¿Qué estás pensando comprar?",
    "search.short": "Buscar ofertas",
    "search.clear": "Borrar búsqueda",
    "nav.primary": "Navegación principal",
    "nav.today": "La oferta de hoy",
    "nav.todayShort": "Hoy",
    "nav.more": "9 ofertas más que vale la pena ver",
    "nav.categories": "Categorías",
    "nav.trending": "Tendencias",
    "nav.archive": "Ofertas anteriores",
    "nav.check": "Cómo verificamos",
    "nav.about": "Nosotros",
    "nav.subscribe": "Recibe la oferta diaria",
    "menu.open": "Abrir menú",
    "menu.close": "Cerrar menú",
    "theme.dark": "Oscuro",
    "theme.light": "Claro",
    "theme.toDark": "Cambiar al modo oscuro",
    "theme.toLight": "Cambiar al modo claro",
    "back.top": "Volver arriba",
    "home.eyebrow": "UNA OFERTA REALMENTE BUENA, VERIFICADA CADA DÍA",
    "home.eyebrowMarket": "UNA OFERTA REALMENTE BUENA EN {country}, VERIFICADA CADA DÍA",
    "home.title": "Míralo aquí<br><span>antes de comprar.</span>",
    "home.intro": "Comparamos el precio, la calidad del producto y las señales del vendedor para que tu primera parada antes de comprar sea más inteligente.",
    "home.introMarket": "Comparamos precios locales de {country}, la calidad del producto y las señales del vendedor para ayudarte a comprar mejor.",
    "home.marketNote": "Las ofertas, la moneda y las tiendas se seleccionan automáticamente según tu ubicación: {country}.",
    "home.modelNote": "OneDailyDrop no vende productos. Al elegir una oferta, te enviamos a la tienda local.",
    "home.seeToday": "Ver la oferta de hoy",
    "home.getTomorrow": "Recibir la oferta de mañana",
    "home.priceSignal": "Señal de precio",
    "home.productQuality": "Calidad del producto",
    "home.sellerConfidence": "Confianza en el vendedor",
    "home.nextDrop": "Próxima oferta",
    "home.preparing": "Estamos preparando la selección de hoy",
    "home.unavailable": "Todavía no hay una oferta destacada.",
    "home.featured": "N.º 1 DE HOY",
    "home.makeHabit": "CONVIÉRTELO EN TU REVISIÓN DIARIA",
    "home.oneUseful": "Una oferta útil. En las categorías que te interesan.",
    "home.chooseInterests": "Elige tus intereses y recibe la mejor selección nueva sin revisar interminables páginas de rebajas.",
    "home.shopFor": "¿Qué sueles comprar?",
    "home.chooseCategory": "Elige al menos una categoría.",
    "home.email": "Correo electrónico",
    "home.subscribe": "Recibir mi oferta diaria",
    "home.noSpam": "Sin spam. Cancela cuando quieras.",
    "home.moreEyebrow": "MÁS SELECCIONES INTELIGENTES",
    "home.noMatch": "Ningún producto coincide con esa búsqueda.",
    "home.scoreEyebrow": "LA PUNTUACIÓN ONEDAILYDROP",
    "home.scoreTitle": "Una puntuación sencilla con una lógica visible.",
    "home.scoreIntro": "Cada selección se evalúa con el mismo sistema de seis partes.",
    "home.methodology": "Lee nuestra metodología completa →",
    "home.priceQuality": "Calidad del precio",
    "home.reviewConfidence": "Confianza en las reseñas",
    "home.sellerReliability": "Fiabilidad del vendedor",
    "home.demandUsefulness": "Demanda y utilidad",
    "home.shippingReturns": "Envíos y devoluciones",
    "home.pastEyebrow": "SELECCIONES DIARIAS ANTERIORES",
    "home.yesterday": "Ofertas de ayer",
    "home.historyHabit": "Un hábito necesita historia",
    "home.popular": "POPULAR AHORA",
    "home.trending": "Ofertas en tendencia",
    "home.savings": "MAYORES AHORROS",
    "home.priceDrops": "Bajadas de precio",
    "home.added": "RECIÉN AÑADIDO",
    "home.newDrops": "Nuevas ofertas",
    "home.promise": "LA PROMESA ONEDAILYDROP",
    "home.lessScrolling": "Menos desplazamiento. Mejores decisiones de compra.",
    "home.oneWinner": "Un ganador claro",
    "home.oneWinnerText": "La oferta diaria sigue siendo el centro. Todo lo demás es secundario.",
    "home.reasons": "Razones que puedes comprobar",
    "home.reasonsText": "Explicamos por qué el precio, el producto y el vendedor merecen atención.",
    "home.transparent": "Monetización transparente",
    "home.transparentText": "Las comisiones de afiliación nunca cambian tu precio ni deciden nuestra selección.",
    "seo.homeTitle": "Mejores ofertas diarias en {country} | OneDailyDrop",
    "seo.homeDescription": "OneDailyDrop comprueba precios locales, calidad y vendedores para encontrar una gran oferta diaria en {country}, además de nueve productos más.",
    "product.retailer": "Tienda",
    "product.deals": "Ofertas",
    "product.verified": "OFERTA VERIFICADA",
    "product.editorPick": "SELECCIÓN EDITORIAL",
    "product.trending": "TENDENCIA",
    "product.popular": "SELECCIÓN POPULAR",
    "product.availabilitySoon": "Disponibilidad en la tienda próximamente",
    "product.priceChecked": "Precio verificado {date}",
    "product.priceVerified": "Precio verificado recientemente",
    "product.retailerPrice": "Precio de la tienda",
    "product.currentPrice": "Precio actual",
    "product.checkPrice": "Consultar precio",
    "product.why": "Por qué lo elegimos:",
    "product.reviews": "reseñas",
    "product.score": "Puntuación",
    "product.save": "AHORRA {percent}%",
    "product.off": "{percent}% menos",
    "product.viewDetails": "VER DETALLES",
    "product.viewDealAt": "VER OFERTA EN {store}",
    "product.priceHistory": "HISTORIAL DE PRECIOS",
    "product.offerDetails": "Detalles de la oferta",
    "product.soldBy": "Vendido por",
    "product.delivery": "Entrega",
    "product.returns": "Devoluciones",
    "product.confirmRetailer": "Confirmar en la tienda",
    "product.retailerPolicy": "Ver política de la tienda",
    "product.selectedFallback": "Elegido por su precio, las opiniones de compradores y su valor general.",
    "product.demoFallback": "Elegido por su utilidad diaria y sus funciones claras.",
    "search.results": "Resultados de búsqueda",
    "search.found": "{count} productos encontrados",
    "search.products": "{count} productos",
    "form.validEmail": "Introduce un correo electrónico válido.",
    "form.chooseCategory": "Elige al menos una categoría antes de suscribirte.",
    "form.saving": "Guardando tus preferencias…",
    "form.failed": "No se pudo completar la suscripción.",
    "form.subscribed": "Ya estás suscrito a la oferta diaria.",
    "form.subscribedEmail": "Ya estás suscrito. Revisa tu correo para confirmar.",
    "load.failed": "No se pudieron cargar las selecciones de hoy",
    "footer.about": "Nosotros",
    "footer.contact": "Contacto",
    "footer.privacy": "Privacidad",
    "footer.terms": "Condiciones",
    "footer.affiliate": "Divulgación de afiliados",
    "footer.editorial": "Política editorial",
    "footer.selection": "Cómo seleccionamos ofertas",
    "footer.price": "Aviso sobre precios",
    "footer.disclosure": "Seleccionamos los productos de forma independiente. OneDailyDrop puede recibir una comisión por tus compras, sin coste adicional para ti. Los precios y la disponibilidad pueden cambiar.",
    "page.home": "Inicio",
    "page.brands": "Marcas",
    "page.products": "Productos",
    "page.averagePrice": "Precio medio",
    "page.averageRating": "Valoración media",
    "page.averageDiscount": "Descuento medio",
    "page.viewDetails": "Ver detalles",
    "page.popularBrands": "Marcas populares",
    "page.pastDrops": "Ofertas anteriores",
    "page.searchDeals": "Buscar ofertas",
    "page.backToday": "Volver a la oferta de hoy",
    "page.notFoundTitle": "Esta oferta se escapó.",
    "page.notFoundText": "Esa página no existe o se ha movido. Volvamos a las ofertas.",
    "page.whyPicked": "Por qué lo elegimos",
    "page.customerRating": "Valoración de clientes",
    "page.priceHistory": "Historial de precios",
    "page.low30": "Mínimo registrado en 30 días",
    "page.low90": "Mínimo registrado en 90 días",
    "page.lowAll": "Mínimo histórico registrado",
    "page.availability": "Disponibilidad",
    "page.priceChecked": "Precio verificado",
    "page.finalPrice": "El precio final se confirma en el sitio web de la tienda.",
    "page.productsChecked": "Productos revisados",
    "page.currentRange": "Rango de precios actual",
    "page.archivePreparing": "Estamos preparando el archivo.",
    "page.bestCategoryDeals": "Mejores ofertas de {category}",
    "page.categoryDescription": "Explora las mejores ofertas de {category} disponibles en {country}, seleccionadas por OneDailyDrop."
  },
  fr: {
    "brand.tagline": "Vérifiez ici avant d’acheter.",
    "brand.seoTagline": "Les meilleures offres. Chaque jour.",
    "language.label": "Langue",
    "country.label": "Pays",
    "search.placeholder": "Qu’envisagez-vous d’acheter ?",
    "search.short": "Rechercher des offres",
    "search.clear": "Effacer la recherche",
    "nav.primary": "Navigation principale",
    "nav.today": "L’offre du jour",
    "nav.todayShort": "Aujourd’hui",
    "nav.more": "9 autres offres à découvrir",
    "nav.categories": "Catégories",
    "nav.trending": "Tendances",
    "nav.archive": "Offres précédentes",
    "nav.check": "Notre méthode",
    "nav.about": "À propos",
    "nav.subscribe": "Recevoir l’offre du jour",
    "menu.open": "Ouvrir le menu",
    "menu.close": "Fermer le menu",
    "theme.dark": "Sombre",
    "theme.light": "Clair",
    "theme.toDark": "Passer en mode sombre",
    "theme.toLight": "Passer en mode clair",
    "back.top": "Retour en haut",
    "home.eyebrow": "UNE VRAIE BONNE OFFRE, VÉRIFIÉE CHAQUE JOUR",
    "home.eyebrowMarket": "UNE VRAIE BONNE OFFRE EN {country}, VÉRIFIÉE CHAQUE JOUR",
    "home.title": "Vérifiez ici<br><span>avant d’acheter.</span>",
    "home.intro": "Nous comparons le prix, la qualité du produit et les signaux du vendeur pour vous aider à mieux acheter.",
    "home.introMarket": "Nous comparons les prix locaux en {country}, la qualité du produit et les signaux du vendeur pour vous aider à mieux acheter.",
    "home.marketNote": "Les offres, la devise et les enseignes sont sélectionnées automatiquement selon votre localisation : {country}.",
    "home.modelNote": "OneDailyDrop ne vend pas de produits. Lorsque vous choisissez une offre, nous vous redirigeons vers l’enseigne locale.",
    "home.seeToday": "Voir l’offre du jour",
    "home.getTomorrow": "Recevoir l’offre de demain",
    "home.priceSignal": "Signal de prix",
    "home.productQuality": "Qualité du produit",
    "home.sellerConfidence": "Fiabilité du vendeur",
    "home.nextDrop": "Prochaine offre",
    "home.preparing": "La sélection du jour est en préparation",
    "home.unavailable": "Aucune offre vedette n’est encore disponible.",
    "home.featured": "N° 1 DU JOUR",
    "home.makeHabit": "VOTRE RENDEZ-VOUS QUOTIDIEN",
    "home.oneUseful": "Une offre utile. Dans les catégories qui vous intéressent.",
    "home.chooseInterests": "Choisissez vos centres d’intérêt et recevez la meilleure sélection sans parcourir des pages de promotions.",
    "home.shopFor": "Qu’achetez-vous le plus souvent ?",
    "home.chooseCategory": "Choisissez au moins une catégorie.",
    "home.email": "Adresse e-mail",
    "home.subscribe": "Recevoir mon offre du jour",
    "home.noSpam": "Aucun spam. Désabonnement à tout moment.",
    "home.moreEyebrow": "D’AUTRES CHOIX MALINS",
    "home.noMatch": "Aucun produit ne correspond à cette recherche.",
    "home.scoreEyebrow": "LE SCORE ONEDAILYDROP",
    "home.scoreTitle": "Un score simple avec une logique claire.",
    "home.scoreIntro": "Chaque sélection est évaluée selon le même cadre en six parties.",
    "home.methodology": "Lire notre méthodologie complète →",
    "home.priceQuality": "Qualité du prix",
    "home.reviewConfidence": "Fiabilité des avis",
    "home.sellerReliability": "Fiabilité du vendeur",
    "home.demandUsefulness": "Demande et utilité",
    "home.shippingReturns": "Livraison et retours",
    "home.pastEyebrow": "ANCIENNES SÉLECTIONS DU JOUR",
    "home.yesterday": "Offres d’hier",
    "home.historyHabit": "Une habitude a besoin d’un historique",
    "home.popular": "POPULAIRE EN CE MOMENT",
    "home.trending": "Offres tendance",
    "home.savings": "PLUS FORTES ÉCONOMIES",
    "home.priceDrops": "Baisses de prix",
    "home.added": "NOUVEAUTÉS",
    "home.newDrops": "Nouvelles offres",
    "home.promise": "LA PROMESSE ONEDAILYDROP",
    "home.lessScrolling": "Moins de défilement. De meilleures décisions d’achat.",
    "home.oneWinner": "Un gagnant clair",
    "home.oneWinnerText": "L’offre du jour reste au centre. Tout le reste est secondaire.",
    "home.reasons": "Des raisons vérifiables",
    "home.reasonsText": "Nous expliquons pourquoi le prix, le produit et le vendeur méritent votre attention.",
    "home.transparent": "Monétisation transparente",
    "home.transparentText": "Les commissions d’affiliation ne modifient jamais votre prix et ne déterminent pas nos choix.",
    "seo.homeTitle": "Meilleures offres du jour en {country} | OneDailyDrop",
    "seo.homeDescription": "OneDailyDrop vérifie les prix locaux, la qualité et les vendeurs pour trouver une excellente offre quotidienne en {country}, plus neuf autres produits.",
    "product.retailer": "Enseigne",
    "product.deals": "Offres",
    "product.verified": "OFFRE VÉRIFIÉE",
    "product.editorPick": "CHOIX DE LA RÉDACTION",
    "product.trending": "TENDANCE",
    "product.popular": "CHOIX POPULAIRE",
    "product.availabilitySoon": "Disponibilité bientôt confirmée",
    "product.priceChecked": "Prix vérifié le {date}",
    "product.priceVerified": "Prix vérifié récemment",
    "product.retailerPrice": "Prix chez l’enseigne",
    "product.currentPrice": "Prix actuel",
    "product.checkPrice": "Voir le prix",
    "product.why": "Pourquoi nous l’avons choisi :",
    "product.reviews": "avis",
    "product.score": "Score",
    "product.save": "ÉCONOMISEZ {percent} %",
    "product.off": "{percent} % de réduction",
    "product.viewDetails": "VOIR LES DÉTAILS",
    "product.viewDealAt": "VOIR L’OFFRE CHEZ {store}",
    "product.priceHistory": "HISTORIQUE DES PRIX",
    "product.offerDetails": "Détails de l’offre",
    "product.soldBy": "Vendu par",
    "product.delivery": "Livraison",
    "product.returns": "Retours",
    "product.confirmRetailer": "À confirmer chez l’enseigne",
    "product.retailerPolicy": "Voir la politique de l’enseigne",
    "product.selectedFallback": "Choisi pour son prix, les avis clients et son rapport qualité-prix.",
    "product.demoFallback": "Choisi pour son utilité quotidienne et ses fonctions claires.",
    "search.results": "Résultats de recherche",
    "search.found": "{count} produits trouvés",
    "search.products": "{count} produits",
    "form.validEmail": "Saisissez une adresse e-mail valide.",
    "form.chooseCategory": "Choisissez au moins une catégorie avant de vous abonner.",
    "form.saving": "Enregistrement de vos préférences…",
    "form.failed": "Impossible de finaliser l’abonnement.",
    "form.subscribed": "Vous êtes abonné à l’offre du jour.",
    "form.subscribedEmail": "Votre abonnement est enregistré. Consultez votre boîte mail pour confirmer.",
    "load.failed": "Impossible de charger les sélections du jour",
    "footer.about": "À propos",
    "footer.contact": "Contact",
    "footer.privacy": "Confidentialité",
    "footer.terms": "Conditions",
    "footer.affiliate": "Divulgation d’affiliation",
    "footer.editorial": "Politique éditoriale",
    "footer.selection": "Comment nous sélectionnons les offres",
    "footer.price": "Avertissement sur les prix",
    "footer.disclosure": "Nous sélectionnons les produits en toute indépendance. OneDailyDrop peut recevoir une commission sur vos achats, sans frais supplémentaires. Les prix et la disponibilité peuvent changer.",
    "page.home": "Accueil",
    "page.brands": "Marques",
    "page.products": "Produits",
    "page.averagePrice": "Prix moyen",
    "page.averageRating": "Note moyenne",
    "page.averageDiscount": "Remise moyenne",
    "page.viewDetails": "Voir les détails",
    "page.popularBrands": "Marques populaires",
    "page.pastDrops": "Offres précédentes",
    "page.searchDeals": "Rechercher des offres",
    "page.backToday": "Retour à l’offre du jour",
    "page.notFoundTitle": "Cette offre nous a échappé.",
    "page.notFoundText": "Cette page n’existe pas ou a été déplacée. Revenons aux offres.",
    "page.whyPicked": "Pourquoi nous l’avons choisi",
    "page.customerRating": "Note des clients",
    "page.priceHistory": "Historique des prix",
    "page.low30": "Prix suivi le plus bas sur 30 jours",
    "page.low90": "Prix suivi le plus bas sur 90 jours",
    "page.lowAll": "Prix suivi le plus bas",
    "page.availability": "Disponibilité",
    "page.priceChecked": "Prix vérifié",
    "page.finalPrice": "Le prix final est confirmé sur le site de l’enseigne.",
    "page.productsChecked": "Produits vérifiés",
    "page.currentRange": "Fourchette de prix actuelle",
    "page.archivePreparing": "L’historique est en préparation.",
    "page.bestCategoryDeals": "Meilleures offres {category}",
    "page.categoryDescription": "Découvrez les meilleures offres {category} disponibles en {country}, sélectionnées par OneDailyDrop."
  },
  de: {
    "brand.tagline": "Hier prüfen, bevor Sie kaufen.",
    "brand.seoTagline": "Die besten Angebote. Jeden Tag.",
    "language.label": "Sprache",
    "country.label": "Land",
    "search.placeholder": "Was möchten Sie kaufen?",
    "search.short": "Angebote suchen",
    "search.clear": "Suche löschen",
    "nav.primary": "Hauptnavigation",
    "nav.today": "Heutiges Angebot",
    "nav.todayShort": "Heute",
    "nav.more": "9 weitere sehenswerte Angebote",
    "nav.categories": "Kategorien",
    "nav.trending": "Im Trend",
    "nav.archive": "Frühere Angebote",
    "nav.check": "Unsere Prüfung",
    "nav.about": "Über uns",
    "nav.subscribe": "Tägliches Angebot erhalten",
    "menu.open": "Menü öffnen",
    "menu.close": "Menü schließen",
    "theme.dark": "Dunkel",
    "theme.light": "Hell",
    "theme.toDark": "Zum dunklen Modus wechseln",
    "theme.toLight": "Zum hellen Modus wechseln",
    "back.top": "Nach oben",
    "home.eyebrow": "EIN WIRKLICH GUTES ANGEBOT, TÄGLICH GEPRÜFT",
    "home.eyebrowMarket": "EIN WIRKLICH GUTES ANGEBOT IN {country}, TÄGLICH GEPRÜFT",
    "home.title": "Hier prüfen,<br><span>bevor Sie kaufen.</span>",
    "home.intro": "Wir vergleichen Preis, Produktqualität und Verkäufersignale, damit Sie vor dem Kauf besser entscheiden.",
    "home.introMarket": "Wir vergleichen lokale Preise in {country}, Produktqualität und Verkäufersignale, damit Sie besser entscheiden.",
    "home.marketNote": "Angebote, Währung und Händler werden automatisch anhand Ihres Standorts ausgewählt: {country}.",
    "home.modelNote": "OneDailyDrop verkauft keine Produkte. Wenn Sie ein Angebot wählen, leiten wir Sie zum lokalen Händler weiter.",
    "home.seeToday": "Heutiges Angebot ansehen",
    "home.getTomorrow": "Morgiges Angebot erhalten",
    "home.priceSignal": "Preissignal",
    "home.productQuality": "Produktqualität",
    "home.sellerConfidence": "Vertrauen in den Verkäufer",
    "home.nextDrop": "Nächstes Angebot",
    "home.preparing": "Die heutige Auswahl wird vorbereitet",
    "home.unavailable": "Noch ist kein Top-Angebot verfügbar.",
    "home.featured": "HEUTE NR. 1",
    "home.makeHabit": "IHR TÄGLICHER CHECK",
    "home.oneUseful": "Ein nützliches Angebot. In den Kategorien, die Sie interessieren.",
    "home.chooseInterests": "Wählen Sie Ihre Interessen und erhalten Sie die beste neue Auswahl ohne endlose Angebotsseiten.",
    "home.shopFor": "Wonach suchen Sie?",
    "home.chooseCategory": "Bitte wählen Sie mindestens eine Kategorie.",
    "home.email": "E-Mail-Adresse",
    "home.subscribe": "Mein tägliches Angebot erhalten",
    "home.noSpam": "Kein Spam. Jederzeit abbestellbar.",
    "home.moreEyebrow": "WEITERE CLEVER AUSGEWÄHLTE ANGEBOTE",
    "home.noMatch": "Keine Produkte entsprechen dieser Suche.",
    "home.scoreEyebrow": "DER ONEDAILYDROP SCORE",
    "home.scoreTitle": "Ein einfacher Score mit klarer Logik.",
    "home.scoreIntro": "Jede Auswahl wird nach demselben sechsteiligen System bewertet.",
    "home.methodology": "Unsere vollständige Methode lesen →",
    "home.priceQuality": "Preisqualität",
    "home.reviewConfidence": "Vertrauenswürdige Bewertungen",
    "home.sellerReliability": "Zuverlässigkeit des Verkäufers",
    "home.demandUsefulness": "Nachfrage und Nutzen",
    "home.shippingReturns": "Versand und Rückgabe",
    "home.pastEyebrow": "FRÜHERE TAGESAUSWAHL",
    "home.yesterday": "Angebote von gestern",
    "home.historyHabit": "Eine Gewohnheit braucht Geschichte",
    "home.popular": "JETZT BELIEBT",
    "home.trending": "Trend-Angebote",
    "home.savings": "GRÖSSTE ERSPARNIS",
    "home.priceDrops": "Preissenkungen",
    "home.added": "NEU HINZUGEFÜGT",
    "home.newDrops": "Neue Angebote",
    "home.promise": "DAS ONEDAILYDROP VERSPRECHEN",
    "home.lessScrolling": "Weniger scrollen. Besser kaufen.",
    "home.oneWinner": "Ein klarer Gewinner",
    "home.oneWinnerText": "Das tägliche Angebot bleibt im Mittelpunkt. Alles andere ist zweitrangig.",
    "home.reasons": "Nachvollziehbare Gründe",
    "home.reasonsText": "Wir erklären, warum Preis, Produkt und Verkäufer Aufmerksamkeit verdienen.",
    "home.transparent": "Transparente Finanzierung",
    "home.transparentText": "Affiliate-Provisionen ändern niemals Ihren Preis und bestimmen nicht unsere Auswahl.",
    "seo.homeTitle": "Beste tägliche Angebote in {country} | OneDailyDrop",
    "seo.homeDescription": "OneDailyDrop prüft lokale Preise, Qualität und Verkäufer, um ein starkes Tagesangebot in {country} und neun weitere Produkte zu finden.",
    "product.retailer": "Händler",
    "product.deals": "Angebote",
    "product.verified": "GEPRÜFTES ANGEBOT",
    "product.editorPick": "REDAKTIONSTIPP",
    "product.trending": "IM TREND",
    "product.popular": "BELIEBTE AUSWAHL",
    "product.availabilitySoon": "Händlerverfügbarkeit folgt",
    "product.priceChecked": "Preis geprüft: {date}",
    "product.priceVerified": "Preis kürzlich geprüft",
    "product.retailerPrice": "Händlerpreis",
    "product.currentPrice": "Aktueller Preis",
    "product.checkPrice": "Preis prüfen",
    "product.why": "Warum wir es ausgewählt haben:",
    "product.reviews": "Bewertungen",
    "product.score": "Score",
    "product.save": "{percent}% SPAREN",
    "product.off": "{percent}% günstiger",
    "product.viewDetails": "DETAILS ANSEHEN",
    "product.viewDealAt": "ANGEBOT BEI {store}",
    "product.priceHistory": "PREISVERLAUF",
    "product.offerDetails": "Angebotsdetails",
    "product.soldBy": "Verkauft von",
    "product.delivery": "Lieferung",
    "product.returns": "Rückgabe",
    "product.confirmRetailer": "Beim Händler bestätigen",
    "product.retailerPolicy": "Händlerbedingungen ansehen",
    "product.selectedFallback": "Ausgewählt wegen Preis, Kundenfeedback und Gesamtwert.",
    "product.demoFallback": "Ausgewählt wegen klarer Alltagstauglichkeit und einfacher Funktionen.",
    "search.results": "Suchergebnisse",
    "search.found": "{count} Produkte gefunden",
    "search.products": "{count} Produkte",
    "form.validEmail": "Geben Sie eine gültige E-Mail-Adresse ein.",
    "form.chooseCategory": "Wählen Sie vor dem Abonnieren mindestens eine Kategorie.",
    "form.saving": "Ihre Einstellungen werden gespeichert…",
    "form.failed": "Das Abonnement konnte nicht abgeschlossen werden.",
    "form.subscribed": "Sie erhalten jetzt das tägliche Angebot.",
    "form.subscribedEmail": "Ihr Abonnement ist aktiv. Bitte bestätigen Sie es in Ihrem Posteingang.",
    "load.failed": "Die heutige Auswahl konnte nicht geladen werden",
    "footer.about": "Über uns",
    "footer.contact": "Kontakt",
    "footer.privacy": "Datenschutz",
    "footer.terms": "Nutzungsbedingungen",
    "footer.affiliate": "Affiliate-Hinweis",
    "footer.editorial": "Redaktionelle Richtlinie",
    "footer.selection": "So wählen wir Angebote aus",
    "footer.price": "Preishinweis",
    "footer.disclosure": "Wir wählen Produkte unabhängig aus. OneDailyDrop kann bei einem Kauf eine Provision erhalten, ohne Mehrkosten für Sie. Preise und Verfügbarkeit können sich ändern.",
    "page.home": "Startseite",
    "page.brands": "Marken",
    "page.products": "Produkte",
    "page.averagePrice": "Durchschnittspreis",
    "page.averageRating": "Durchschnittsbewertung",
    "page.averageDiscount": "Durchschnittsrabatt",
    "page.viewDetails": "Details ansehen",
    "page.popularBrands": "Beliebte Marken",
    "page.pastDrops": "Frühere Angebote",
    "page.searchDeals": "Angebote suchen",
    "page.backToday": "Zurück zum heutigen Angebot",
    "page.notFoundTitle": "Dieses Angebot ist uns entwischt.",
    "page.notFoundText": "Diese Seite existiert nicht oder wurde verschoben. Zurück zu den Angeboten.",
    "page.whyPicked": "Warum wir es ausgewählt haben",
    "page.customerRating": "Kundenbewertung",
    "page.priceHistory": "Preisverlauf",
    "page.low30": "Niedrigster erfasster Preis in 30 Tagen",
    "page.low90": "Niedrigster erfasster Preis in 90 Tagen",
    "page.lowAll": "Niedrigster erfasster Preis",
    "page.availability": "Verfügbarkeit",
    "page.priceChecked": "Preis geprüft",
    "page.finalPrice": "Der endgültige Preis wird auf der Händlerwebsite bestätigt.",
    "page.productsChecked": "Geprüfte Produkte",
    "page.currentRange": "Aktuelle Preisspanne",
    "page.archivePreparing": "Das Archiv wird vorbereitet.",
    "page.bestCategoryDeals": "Beste Angebote für {category}",
    "page.categoryDescription": "Entdecken Sie die besten Angebote für {category} in {country}, ausgewählt von OneDailyDrop."
  }
};

const categoryNames = {
  en: {},
  es: {
    "Beauty": "Belleza", "Electronics": "Electrónica", "Fashion": "Moda", "Home": "Hogar",
    "Kitchen": "Cocina", "Pets": "Mascotas", "Sports & Outdoors": "Deportes y aire libre",
    "Automotive": "Automóvil", "Toys": "Juguetes", "Deals": "Ofertas", "Office": "Oficina",
    "Smart Home": "Hogar inteligente", "Tools": "Herramientas", "Travel": "Viajes", "Wellness": "Bienestar"
  },
  fr: {
    "Beauty": "Beauté", "Electronics": "Électronique", "Fashion": "Mode", "Home": "Maison",
    "Kitchen": "Cuisine", "Pets": "Animaux", "Sports & Outdoors": "Sports et plein air",
    "Automotive": "Auto", "Toys": "Jouets", "Deals": "Offres", "Office": "Bureau",
    "Smart Home": "Maison connectée", "Tools": "Outils", "Travel": "Voyage", "Wellness": "Bien-être"
  },
  de: {
    "Beauty": "Beauty", "Electronics": "Elektronik", "Fashion": "Mode", "Home": "Wohnen",
    "Kitchen": "Küche", "Pets": "Haustiere", "Sports & Outdoors": "Sport und Outdoor",
    "Automotive": "Auto", "Toys": "Spielzeug", "Deals": "Angebote", "Office": "Büro",
    "Smart Home": "Smart Home", "Tools": "Werkzeuge", "Travel": "Reisen", "Wellness": "Wellness"
  }
};

function normalizeLanguage(value) {
  const code = String(value || "").trim().toLowerCase().split("-")[0];
  return languageDefinitions[code] ? code : "";
}

function languagesForMarket(marketCode) {
  return marketLanguages[String(marketCode || "").toLowerCase()] || ["en"];
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers?.cookie || "").split(";").map(value => value.trim()).filter(Boolean).map(value => {
    const index = value.indexOf("=");
    if (index < 1) return ["", ""];
    try {
      return [decodeURIComponent(value.slice(0, index)), decodeURIComponent(value.slice(index + 1))];
    } catch {
      return ["", ""];
    }
  }).filter(([key]) => key));
}

function resolveLanguage(req, res, marketCode) {
  const code = String(marketCode || "us").toLowerCase();
  const allowed = languagesForMarket(code);
  const requested = normalizeLanguage(req.query?.lang);
  const cookieName = `odd_lang_${code}`;
  const saved = normalizeLanguage(parseCookies(req)[cookieName]);
  const language = allowed.includes(requested)
    ? requested
    : allowed.includes(saved)
      ? saved
      : defaultLanguages[code] || allowed[0] || "en";

  if (requested && allowed.includes(requested) && res?.cookie) {
    res.cookie(cookieName, requested, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 365 * 86400000,
      path: "/"
    });
  }
  if (res?.vary) res.vary("Cookie");
  req.language = language;
  return language;
}

function languageTag(marketCode, language) {
  const code = String(marketCode || "us").toLowerCase();
  const lang = normalizeLanguage(language) || defaultLanguages[code] || "en";
  const region = { us: "US", ca: "CA", uk: "GB", fr: "FR", de: "DE" }[code] || "US";
  return `${lang}-${region}`;
}

function t(language, key, variables = {}) {
  const lang = normalizeLanguage(language) || "en";
  const template = copy[lang]?.[key] ?? copy.en[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (_, name) => variables[name] ?? "");
}

function marketName(marketCode, language) {
  const lang = normalizeLanguage(language) || "en";
  const code = String(marketCode || "us").toLowerCase();
  return marketNames[lang]?.[code] || marketNames.en[code] || code.toUpperCase();
}

function categoryLabel(category, language) {
  const lang = normalizeLanguage(language) || "en";
  return categoryNames[lang]?.[category] || category;
}

function clientCopy(language) {
  const lang = normalizeLanguage(language) || "en";
  const result = { ...copy.en, ...(copy[lang] || {}) };
  for (const [category, label] of Object.entries(categoryNames[lang] || {})) {
    result[`category.${category}`] = label;
  }
  return result;
}

function localizeHtml(html, language) {
  const lang = normalizeLanguage(language) || "en";
  if (lang === "en") return String(html);
  const translations = copy[lang] || {};
  let output = String(html);
  const keys = Object.keys(translations)
    .filter(key => copy.en[key] && !copy.en[key].includes("{"))
    .sort((left, right) => copy.en[right].length - copy.en[left].length);
  for (const key of keys) {
    const from = copy.en[key];
    const to = translations[key];
    if (!from || !to || from === to) continue;
    if (from.includes("<")) {
      output = output.split(from).join(to);
      continue;
    }
    for (const pattern of [
      [`>${from}<`, `>${to}<`],
      [`>✓ ${from}<`, `>✓ ${to}<`],
      [`placeholder="${from}"`, `placeholder="${to}"`],
      [`aria-label="${from}"`, `aria-label="${to}"`],
      [`title="${from}"`, `title="${to}"`],
      [`content="${from}"`, `content="${to}"`]
    ]) {
      output = output.split(pattern[0]).join(pattern[1]);
    }
  }
  for (const [from, to] of Object.entries(categoryNames[lang] || {})) {
    output = output.split(`>${from}<`).join(`>${to}<`);
  }
  return output;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function languageSwitcher(req, marketCode, language) {
  const allowed = languagesForMarket(marketCode);
  if (allowed.length < 2) return "";
  const originalPath = String(req.originalUrl || `/${marketCode}`).split("?")[0] || `/${marketCode}`;
  const hidden = Object.entries(req.query || {})
    .filter(([key]) => key !== "lang")
    .flatMap(([key, value]) => (Array.isArray(value) ? value : [value])
      .map(item => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(item)}">`))
    .join("");
  return `<link rel="stylesheet" href="/i18n.css?v=20260728-2"><form class="language-switcher" method="get" action="${escapeHtml(originalPath)}"><label><span class="sr-only">${escapeHtml(t(language, "language.label"))}</span><select name="lang" aria-label="${escapeHtml(t(language, "language.label"))}" onchange="this.form.submit()">${allowed.map(code => `<option value="${code}"${code === language ? " selected" : ""}>${escapeHtml(languageDefinitions[code].label)}</option>`).join("")}</select></label>${hidden}<noscript><button type="submit">OK</button></noscript></form>`;
}

function countrySwitcher(req, marketCode, language) {
  const originalPath = String(req.originalUrl || `/${marketCode}`).split("?")[0] || `/${marketCode}`;
  const regionalPrefix = new RegExp(`^/(${Object.keys(defaultLanguages).join("|")})(?=/|$)`);
  const rawSuffix = originalPath.replace(regionalPrefix, "") || "";
  const suffix = /^\/(?:deal|brand)\//.test(rawSuffix) ? "" : rawSuffix;
  const query = new URLSearchParams(req.query || {});
  query.delete("lang");
  const queryString = query.toString();
  const options = Object.keys(defaultLanguages).map(code => {
    const destination = `/${code}${suffix}${queryString ? `?${queryString}` : ""}`;
    return `<option value="${escapeHtml(destination)}"${code === marketCode ? " selected" : ""}>${escapeHtml(marketName(code, language))}</option>`;
  }).join("");
  return `<link rel="stylesheet" href="/i18n.css?v=20260728-country"><form class="country-switcher" onsubmit="return false"><label><span class="sr-only">${escapeHtml(t(language, "country.label"))}</span><select aria-label="${escapeHtml(t(language, "country.label"))}" onchange="window.location.assign(this.value)">${options}</select></label></form>`;
}

module.exports = {
  copy,
  languageDefinitions,
  marketLanguages,
  defaultLanguages,
  normalizeLanguage,
  languagesForMarket,
  resolveLanguage,
  languageTag,
  t,
  marketName,
  categoryLabel,
  clientCopy,
  localizeHtml,
  languageSwitcher,
  countrySwitcher
};
