import Link from "next/link";
import { Prose } from "@/components/site/Prose";
import { StoreMarquee } from "@/components/site/StoreMarquee";

/*
 * The text pages, in Spanish.
 *
 * These pages were written straight into JSX in English, so a visitor who
 * chose Español got the navigation in Spanish and every page they opened from
 * the footer in English. Each page keeps its English as written and renders
 * the version here when the language is Spanish; French and German still read
 * the English.
 *
 * The legal pages say that the English text is the one that governs. A
 * translation offered for convenience must not become a second, slightly
 * different contract.
 */

const mail = (
  <a className="font-medium text-fg underline underline-offset-4" href="mailto:info@onedailydrop.com">
    info@onedailydrop.com
  </a>
);

const TranslationNote = () => (
  <p className="pt-2 text-sm text-fg-subtle">
    Esta traducción se ofrece por comodidad. Si hay alguna diferencia, prevalece la versión en inglés.
  </p>
);

export const spanishMeta: Record<string, { title: string; description: string }> = {
  about: {
    title: "Sobre OneDailyDrop",
    description: "Qué comprueba OneDailyDrop antes de recomendar algo, cómo gana dinero y qué no hace a propósito.",
  },
  howWeSelect: {
    title: "Cómo seleccionamos las ofertas",
    description: "La evidencia detrás de cada selección de OneDailyDrop: señal de precio, calidad del producto y confianza en el vendedor.",
  },
  contact: { title: "Contacto", description: "Preguntas, correcciones, propuestas de colaboración y ofertas son bienvenidas." },
  affiliate: {
    title: "Divulgación de afiliación",
    description: "OneDailyDrop puede ganar una comisión cuando haces clic en algunos enlaces o realizas una compra que cumple los requisitos.",
  },
  editorial: {
    title: "Política editorial",
    description: "Cómo OneDailyDrop mantiene sus recomendaciones útiles, comprensibles e independientes.",
  },
  priceDisclaimer: {
    title: "Aviso sobre precios",
    description: "Los precios y la disponibilidad pueden cambiar en cualquier momento. Confirma siempre la oferta final con el comercio.",
  },
  terms: { title: "Términos de uso", description: "Los términos que aceptas al usar OneDailyDrop." },
  privacy: { title: "Política de privacidad", description: "Qué información puede recopilar OneDailyDrop y cómo se utiliza." },
  stores: { title: "Tiendas con las que trabajamos", description: "Los comercios cuyos productos aparecen en OneDailyDrop y cómo sumarse." },
  forRetailers: {
    title: "Colabora con OneDailyDrop",
    description: "Qué es OneDailyDrop, cómo se seleccionan los productos, qué obtiene un comercio y cómo contactarnos.",
  },
  saved: { title: "Productos guardados", description: "Los productos que guardaste para volver a verlos." },
};

export function SpanishAbout({
  market,
  country,
  catalogSize,
  categoryCount,
}: {
  market: string;
  country: string;
  catalogSize: number;
  categoryCount: number;
}) {
  return (
    <Prose
      market={market}
      crumb="Sobre nosotros"
      title="Sobre OneDailyDrop"
      lede="Una web de compras que comprueba la oferta antes de recomendarla, y te enseña cómo lo hace."
    >
      <p>
        OneDailyDrop es una web para buscar y comparar en {country}: {catalogSize} productos en {categoryCount}{" "}
        categorías, cada uno comprobado antes de publicarse. Delia, la asistente, busca primero entre esos productos
        comprobados y, cuando mira más allá, lo dice: las tiendas con las que tenemos acuerdos todavía no cubren todas
        las preguntas. Una vez al día publicamos además el Daily Drop, las selecciones mejor valoradas de esa mañana,
        pero es una función de la web, no la web entera.
      </p>

      <h2>Qué significa «comprobado»</h2>
      <p>
        Para aparecer aquí, un producto necesita un enlace a la tienda que funcione, un precio actual y existencias.
        Revisamos esos enlaces cada noche, y un producto cuyo enlace ha dejado de funcionar sale del catálogo en lugar
        de quedarse pareciendo válido.
      </p>
      <p>
        El coste de envío y las devoluciones son otra cuestión. Algunas tiendas los publican para cada producto y otras
        no: eBay nos da ambos datos, mientras que Newegg y nuestros feeds de afiliación no dan ninguno. Cuando una tienda
        no los publica, la página dice «confirmar en la tienda» en lugar de inventar una cifra, y el producto recibe una
        valoración de evidencia más baja.
      </p>
      <p>
        Además comparamos el precio con cifras de referencia verificadas, leemos las opiniones del producto y del
        vendedor, y publicamos el razonamiento junto a cada selección. Cuando falta una señal, la página lo dice.
      </p>

      <h2>Lo que no hacemos a propósito</h2>
      <ul>
        <li>No vendemos productos, no tenemos existencias y no cobramos pagos.</li>
        <li>No aceptamos pagos por aparecer ni por una puntuación más alta.</li>
        <li>
          No inventamos precios de referencia. Si no existe un precio anterior verificado, no mostramos descuento,
          aunque la tienda lo muestre.
        </li>
        <li>No adivinamos especificaciones. Los detalles desconocidos se omiten en lugar de rellenarse.</li>
        <li>No inflamos el Daily Drop. Si un día solo siete productos superan el listón, se publican siete.</li>
      </ul>

      <h2>Cómo ganamos dinero</h2>
      <p>
        Cuando eliges una oferta te enviamos a la tienda, y podemos ganar una comisión de afiliación por clics o compras
        que cumplan los requisitos. Esa comisión no suma puntos a ninguna puntuación ni influye en lo que se recomienda.
        Es la razón por la que la web es gratuita, y se indica en cada página que lleva un enlace a una tienda.
      </p>

      <h2>Delia</h2>
      <p>
        Delia busca primero en el catálogo comprobado, así que todo lo que ofrece desde ahí ya ha pasado las mismas
        comprobaciones que el resto. Cuando el catálogo no tiene respuesta, busca más allá (tenemos acuerdos con algunas
        tiendas, no con todas) y dice qué es qué, porque un producto que hemos comprobado y una página que simplemente
        hemos encontrado no son lo mismo. El reconocimiento de voz funciona en tu navegador y no necesita cuenta; si tu
        navegador no lo tiene, puedes escribir.
      </p>

      <h2>Quién la dirige</h2>
      <p>
        OneDailyDrop es una web independiente con sede en Brooklyn, Nueva York. No pertenece a ninguna tienda cuyos
        productos aparecen aquí ni recibe instrucciones editoriales de ellas. Las tiendas que quieran trabajar con
        nosotros pueden leer la <a href={`/${market}/for-retailers`}>página para comercios</a>.
      </p>
    </Prose>
  );
}

export function SpanishHowWeSelect({ market, country }: { market: string; country: string }) {
  return (
    <Prose
      market={market}
      crumb="Cómo seleccionamos"
      title="Cómo seleccionamos las ofertas"
      lede={`Una selección al día para ${country}, elegida entre productos que superan tres comprobaciones distintas. Esto es lo que significa cada una.`}
    >
      <h2>Señal de precio</h2>
      <p>
        Seguimos el precio de cada producto a lo largo del tiempo y comparamos la cifra actual con el precio de
        referencia de la propia tienda. Solo mostramos un ahorro cuando esa referencia está verificada. Si no existe, la
        página lo dice en lugar de inventar un número tachado.
      </p>

      <h2>Calidad del producto</h2>
      <p>
        Las valoraciones y el número de opiniones se leen del propio anuncio y se mantienen separados de las opiniones
        sobre el vendedor, porque un producto bien valorado vendido por un vendedor poco fiable no es una buena compra.
        Los productos sin opiniones no se excluyen, pero se marcan como sin valoración en lugar de puntuarse como si
        fueran perfectos.
      </p>

      <h2>Confianza en el vendedor</h2>
      <p>
        El porcentaje de opiniones positivas, cuántas valoraciones lo respaldan y las condiciones de envío y devolución
        declaradas influyen en la evaluación. Un porcentaje alto con pocas valoraciones pesa menos que el mismo
        porcentaje con miles.
      </p>

      <h2>Qué es la puntuación</h2>
      <p>
        La puntuación OneDailyDrop va de 0 a 100 y combina esas tres comprobaciones con las condiciones de compra de la
        oferta. Describe un anuncio concreto en un momento concreto, no un producto en general.
      </p>

      <h2>Qué no es la puntuación</h2>
      <p>
        La comisión de afiliación no suma puntos y nunca decide qué producto es el Daily Drop. No vendemos productos,
        no tenemos existencias ni procesamos pagos. Cuando eliges una oferta te enviamos a la tienda, que sigue siendo la
        fuente final del precio, el modelo, el estado y el total al pagar.
      </p>
    </Prose>
  );
}

export function SpanishContact({ market }: { market: string }) {
  return (
    <Prose
      market={market}
      crumb="Contacto"
      title="Escríbenos."
      lede="Preguntas, correcciones, propuestas de colaboración y ofertas son bienvenidas."
    >
      <h2>Consultas generales</h2>
      <p>{mail}</p>
      <h2>Colaboraciones con afiliados y tiendas</h2>
      <p>{mail}</p>
      <h2>Enviar una oferta</h2>
      <p>Envía una oferta por email a {mail}.</p>
      <h2>Correcciones y derechos de autor</h2>
      <p>Contacta con el equipo editorial en {mail}.</p>
      <h2>Tiempo de respuesta</h2>
      <p>
        Intentamos revisar las consultas legítimas en un plazo de dos días hábiles. Los precios y la disponibilidad
        pueden cambiar rápido, así que incluye el nombre del producto, la tienda y la URL de la página cuando informes de
        un problema.
      </p>
      <p className="pt-4 text-sm text-fg-subtle">Última actualización: 22 de julio de 2026</p>
    </Prose>
  );
}

export function SpanishAffiliate({ market }: { market: string }) {
  return (
    <Prose
      market={market}
      crumb="Divulgación de afiliación"
      title="Divulgación de afiliación"
      lede="OneDailyDrop puede ganar una comisión cuando haces clic en algunos enlaces de tiendas o realizas una compra que cumple los requisitos."
    >
      <p>
        No pagas más porque un enlace sea de afiliación. Una tienda o red de afiliación puede compensar a OneDailyDrop por
        un clic o una compra que cumpla los requisitos.
      </p>
      <h2>Cómo funcionan los enlaces de afiliación</h2>
      <p>
        Algunos enlaces incluyen información de seguimiento que permite a una tienda o red de afiliación saber que el
        comprador llegó desde OneDailyDrop. Según el programa, podemos recibir una comisión por un clic válido o por una
        compra que cumpla los requisitos realizada dentro del periodo de atribución correspondiente. No todos los enlaces
        ni todos los clics generan un pago.
      </p>
      <h2>Independencia editorial</h2>
      <p>
        La compensación no garantiza la aparición, una descripción positiva ni una puntuación OneDailyDrop favorable.
        Priorizamos la utilidad, la calidad del producto, la confianza del cliente, la disponibilidad y la fiabilidad de
        la tienda.
      </p>
      <h2>Divulgación de Amazon</h2>
      <p>
        Como Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables. (As an
        Amazon Associate I earn from qualifying purchases.)
      </p>
      <h2>Preguntas</h2>
      <p>Puedes enviar preguntas sobre nuestras relaciones de afiliación a {mail}.</p>
      <p className="pt-4 text-sm text-fg-subtle">Última actualización: 13 de septiembre de 2026</p>
      <TranslationNote />
    </Prose>
  );
}

export function SpanishEditorial({ market }: { market: string }) {
  return (
    <Prose
      market={market}
      crumb="Política editorial"
      title="Política editorial"
      lede="Nuestro objetivo es que las recomendaciones de ofertas sean útiles, comprensibles e independientes."
    >
      <h2>Criterios de selección</h2>
      <p>
        Los productos pueden evaluarse según el precio actual, el historial de precios cuando está disponible, la calidad
        del descuento, la valoración de los clientes, el número de opiniones, la disponibilidad, la fiabilidad de la
        tienda, la utilidad y la relevancia para la categoría.
      </p>
      <h2>Independencia</h2>
      <p>
        Las tiendas y las marcas no pueden comprar una recomendación o una puntuación positiva garantizada. Si se
        introducen colocaciones patrocinadas, se identificarán claramente y se mantendrán separadas de la selección
        editorial independiente.
      </p>
      <h2>Exactitud</h2>
      <p>
        Intentamos verificar los precios, la disponibilidad y los datos principales del producto antes de publicarlos.
        Como la información de las tiendas cambia rápido, la página de pago sigue siendo la fuente final del precio y la
        disponibilidad.
      </p>
      <h2>Correcciones</h2>
      <p>
        Los errores importantes deben corregirse con rapidez. Puedes informar de un problema a {mail} con el nombre del
        producto, la tienda y la URL de la página.
      </p>
      <h2>Opiniones y valoraciones</h2>
      <p>
        Las valoraciones de las tiendas y el número de opiniones son señales de terceros, no recomendaciones de
        OneDailyDrop. Podemos excluir productos con opiniones sospechosas, insuficientes o poco fiables.
      </p>
      <h2>Compensación de afiliación</h2>
      <p>
        Las comisiones de afiliación pueden ayudar a mantener la web, pero el porcentaje de comisión no debe imponerse al
        valor para el comprador ni a la exactitud de los datos.
      </p>
      <p className="pt-4 text-sm text-fg-subtle">Última actualización: 22 de julio de 2026</p>
      <TranslationNote />
    </Prose>
  );
}

export function SpanishPriceDisclaimer({ market }: { market: string }) {
  return (
    <Prose
      market={market}
      crumb="Aviso sobre precios"
      title="Aviso sobre precios"
      lede="Los precios y la disponibilidad pueden cambiar en cualquier momento. Confirma siempre la oferta final con la tienda."
    >
      <p>El precio que se muestra en la web de la tienda o al pagar es el que prevalece.</p>
      <h2>Cambios de precio</h2>
      <p>
        Los precios pueden cambiar entre el momento en que OneDailyDrop comprueba una oferta y el momento en que un
        visitante llega a la tienda. Las ofertas relámpago, los cupones, los precios para miembros, la ubicación y las
        existencias pueden afectar al importe final.
      </p>
      <h2>Precios de referencia y originales</h2>
      <p>
        Un precio original, de catálogo o «antes» puede proceder de los datos de la tienda o del historial de precios
        disponible. Solo pretendemos presentar un descuento como verificado cuando los datos lo respaldan razonablemente.
      </p>
      <h2>Disponibilidad</h2>
      <p>
        Las existencias, la disponibilidad del vendedor, las fechas de entrega y los gastos de envío dependen de la tienda
        y pueden variar según la ubicación.
      </p>
      <h2>Impuestos, cargos y cupones</h2>
      <p>
        Los precios mostrados pueden no incluir impuestos, envío, instalación, suscripciones u otros cargos. Algunos
        precios pueden requerir un cupón, una cuenta, una membresía o un código promocional.
      </p>
      <h2>Errores</h2>
      <p>
        Los feeds automáticos y las páginas de las tiendas pueden contener errores. Informa de posibles inexactitudes a{" "}
        {mail} e incluye la URL de la página.
      </p>
      <p className="pt-4 text-sm text-fg-subtle">Última actualización: 22 de julio de 2026</p>
      <TranslationNote />
    </Prose>
  );
}

export function SpanishTerms({ market }: { market: string }) {
  return (
    <Prose
      market={market}
      crumb="Términos"
      title="Términos de uso"
      lede="Al usar OneDailyDrop, aceptas estos términos."
    >
      <h2>Servicio informativo</h2>
      <p>
        OneDailyDrop ofrece información de productos, descubrimiento de ofertas y enlaces a tiendas de terceros. No
        vendemos ni enviamos los productos que aparecen en la web.
      </p>
      <h2>Precios y disponibilidad</h2>
      <p>
        Los precios, descuentos, envíos, impuestos, existencias y detalles de los productos pueden cambiar sin previo
        aviso. La página de pago de la tienda determina el precio final y las condiciones de compra.
      </p>
      <h2>Relaciones de afiliación</h2>
      <p>
        Algunos enlaces salientes son de afiliación. OneDailyDrop puede recibir una compensación por clics o compras que
        cumplan los requisitos, sin coste adicional para el comprador.
      </p>
      <h2>Sin garantías</h2>
      <p>
        La web se ofrece «tal cual» y «según disponibilidad». No garantizamos que cada precio, valoración, número de
        opiniones, descripción o estado de disponibilidad esté completo, actualizado o libre de errores.
      </p>
      <h2>Webs de terceros</h2>
      <p>
        Las webs de las tiendas funcionan de forma independiente. OneDailyDrop no es responsable de su contenido,
        prácticas de privacidad, productos, atención al cliente, devoluciones ni transacciones.
      </p>
      <h2>Uso aceptable</h2>
      <p>
        No puedes hacer un mal uso de la web, interferir en su funcionamiento, extraer datos de forma que perjudique la
        disponibilidad del servicio, intentar accesos no autorizados ni usar su contenido de forma ilícita.
      </p>
      <h2>Propiedad intelectual</h2>
      <p>
        La marca OneDailyDrop, los textos originales, la presentación de las puntuaciones y el diseño de la web están
        protegidos por las leyes de propiedad intelectual aplicables. Los nombres de las tiendas, las marcas registradas
        y las imágenes de los productos pertenecen a sus respectivos propietarios.
      </p>
      <h2>Limitación de responsabilidad</h2>
      <p>
        En la medida máxima permitida por la ley, OneDailyDrop no será responsable de pérdidas indirectas, incidentales o
        consecuentes derivadas del uso de la web o de una compra a terceros.
      </p>
      <h2>Contacto</h2>
      <p>Puedes enviar preguntas sobre estos términos a {mail}.</p>
      <p className="pt-4 text-sm text-fg-subtle">Vigente desde: 13 de septiembre de 2026</p>
      <TranslationNote />
    </Prose>
  );
}

export function SpanishPrivacy({ market }: { market: string }) {
  return (
    <Prose
      market={market}
      crumb="Privacidad"
      title="Política de privacidad"
      lede="Esta política explica qué información puede recopilar OneDailyDrop y cómo se utiliza."
    >
      <h2>Información que recopilamos</h2>
      <p>
        Podemos recopilar información técnica como el tipo de dispositivo, el navegador, la ubicación aproximada, las
        páginas visitadas, la fuente de referencia, las búsquedas y los clics en enlaces de tiendas. Si nos contactas o te
        suscribes a comunicaciones, también podemos recibir la información que nos proporciones directamente.
      </p>
      <h2>Analítica y cookies</h2>
      <p>
        Usamos cookies opcionales de Google Analytics para entender el uso de la web y mejorar su rendimiento. Para los
        visitantes de Francia y Alemania, la analítica no se carga salvo que el visitante la acepte. Rechazar la analítica
        no desactiva las funciones esenciales de la web.
      </p>
      <h2>Enlaces de afiliación</h2>
      <p>
        Cuando haces clic en un enlace de una tienda, la tienda o la red de afiliación pueden usar cookies o parámetros de
        seguimiento para atribuir a OneDailyDrop un clic o una compra que cumpla los requisitos. Esos terceros tratan los
        datos según sus propias políticas de privacidad.
      </p>
      <h2>Cómo se usa la información</h2>
      <ul>
        <li>Mantener, proteger y mejorar la web.</li>
        <li>Medir el tráfico, las búsquedas y el rendimiento de los enlaces de afiliación.</li>
        <li>Responder a mensajes y gestionar suscripciones.</li>
        <li>Detectar abusos y cumplir obligaciones legales.</li>
      </ul>
      <h2>Compartir información</h2>
      <p>
        No vendemos información personal. La información puede compartirse con proveedores que prestan servicios de
        alojamiento, analítica, envío de emails y atribución de afiliación, o cuando lo exija la ley.
      </p>
      <h2>Tus opciones</h2>
      <p>
        Puedes aceptar, rechazar o cambiar más tarde el consentimiento de analítica desde la configuración de cookies en
        el pie de la web. También puedes desactivar las cookies en tu navegador y escribirnos a {mail} con preguntas sobre
        privacidad. Según tu jurisdicción, pueden aplicarse derechos adicionales de acceso, eliminación u oposición.
      </p>
      <h2>Menores</h2>
      <p>
        OneDailyDrop no está dirigida a menores de 13 años y no recopilamos a sabiendas su información personal.
      </p>
      <h2>Cambios</h2>
      <p>Podemos actualizar esta política a medida que cambie el servicio. La fecha de vigencia actual aparece abajo.</p>
      <p className="pt-4 text-sm text-fg-subtle">Vigente desde: 30 de julio de 2026</p>
      <TranslationNote />
    </Prose>
  );
}

export function SpanishStores({
  market,
  country,
  total,
  tiles,
}: {
  market: string;
  country: string;
  total: number;
  tiles: Parameters<typeof StoreMarquee>[0]["shops"];
}) {
  return (
    <Prose
      market={market}
      crumb="Tiendas"
      title="Tiendas con las que trabajamos"
      lede="Todos los comercios cuyos productos aparecen aquí."
    >
      <p>
        Estas son las tiendas conectadas hoy a OneDailyDrop en {country}: {total.toLocaleString("es-US")} productos entre
        todas. Cada nombre enlaza directamente con esa tienda.
      </p>

      <StoreMarquee market={market} shops={tiles} />

      <p className="text-sm text-fg-muted">
        Son enlaces de afiliación: podemos ganar una comisión por lo que compres en estas tiendas, sin coste para ti y sin
        cambiar ningún precio.
      </p>

      <h2>Qué significa estar aquí y qué no</h2>
      <p>
        Que una tienda aparezca en esta página significa que nos envía sus productos. No significa que pague por aparecer,
        que elija qué productos se muestran ni que opine sobre cómo se puntúan: nada de eso está a la venta. Cada tienda
        sigue las mismas reglas de clasificación que las demás, y otras pueden superarla con sus propios productos.
      </p>
      <p>
        Tampoco significa que se publique todo lo que envía. Los productos llegan, se comprueban, y la mayoría no se
        convierte en el Daily Drop ni en un Live Drop, que es justo para lo que sirve tener un listón.
      </p>

      <h2>Cómo sumarse</h2>
      <p>
        La <Link href={`/${market}/for-retailers`}>página para comercios</Link> explica qué necesitamos en un feed, cómo se
        puntúan los productos y en qué consiste un Live Drop. Si tienes una tienda y quieres aparecer en esta lista,
        escríbenos a <a href="mailto:info@onedailydrop.com">info@onedailydrop.com</a>.
      </p>
    </Prose>
  );
}

export function SpanishForRetailers({
  market,
  catalogSize,
  marketCount,
  countries,
}: {
  market: string;
  catalogSize: number;
  marketCount: number;
  countries: string;
}) {
  return (
    <Prose
      market={market}
      crumb="Para comercios"
      title="Colabora con OneDailyDrop"
      lede="Qué somos, cómo se eligen los productos y qué puedes esperar si tu catálogo aparece aquí."
    >
      <h2>Qué es OneDailyDrop</h2>
      <p>
        Una web de compras independiente con sede en Brooklyn, Nueva York. Los visitantes buscan en un catálogo de
        productos comprobados antes de publicarse, o preguntan a Delia, nuestra asistente, con sus propias palabras. No
        vendemos nada, no tenemos existencias ni cobramos pagos; cada compra se hace en la web de la propia tienda.
      </p>
      <p>
        Actualmente publicamos en {marketCount} mercados ({countries}), con {catalogSize} productos comprobados en este.
      </p>

      <h2>Cómo se publica un producto</h2>
      <p>
        Un producto necesita un enlace con comisión que funcione, un precio actual y una imagen. Después se puntúa según la
        evidencia de precio, la valoración del producto, el número de opiniones, el historial del vendedor y, cuando la
        fuente los facilita, las condiciones de envío y devolución. Los enlaces se revisan cada noche y uno roto se retira
        automáticamente.
      </p>
      <p>
        Conviene explicar el envío y las devoluciones, porque somos estrictos con ellos en un sitio y no en otro. No son
        obligatorios para aparecer: eBay publica ambos por producto, la mayoría de los feeds no publican ninguno, y un
        producto sin ellos muestra «confirmar en la tienda» donde iría la cifra, en lugar de un número inventado. Sí son
        obligatorios para ser el Daily Drop o un Live Drop, porque ahí recomendamos un precio a alguien y no recomendaremos
        un precio que no sea el que va a pagar.
      </p>
      <p>
        La posición no está a la venta. El porcentaje de comisión no influye en ninguna puntuación, y ninguna tienda puede
        pagar por aparecer, por subir en la clasificación o por ser el Daily Drop. Si nos pides destacar un producto, la
        respuesta honesta será que no, la misma que reciben tus competidores, y es la razón por la que una recomendación
        aquí vale algo.
      </p>

      <h2>Live Drop</h2>
      <p>
        Un producto, un precio, diez minutos, anunciado con antelación. Los compradores llegan a una sala de espera antes
        de que empiece; el precio no está en la página ni en sus datos hasta el segundo en que empieza, así que no hay
        nada que encontrar antes. Una presentadora IA muestra el producto y dice el precio en voz alta en cuanto se abre.
        Cuando pasan los diez minutos, la oferta se cierra y la página lo indica.
      </p>
      <p>
        Existe porque un catálogo premia al comprador que ya está buscando. Un Live Drop da a alguien un motivo para
        llegar en un minuto concreto, y da a un producto toda la pantalla en lugar de una fila en una cuadrícula.
      </p>
      <p>
        Lo que necesitamos de una tienda es una oferta real: un producto, un precio de verdad mejor que el habitual, un
        enlace con comisión y las condiciones de envío y devolución correspondientes. Nosotros organizamos el evento,
        escribimos el guion, avisamos a quienes pidieron recordatorio y después informamos: cuántos esperaron, cuántos
        vieron el precio y cuántos hicieron clic. Lo que no haremos es inventar escasez: no tenemos tus existencias ni
        podemos verlas, así que la presión en un Live Drop es el reloj, que es real, y nunca una cuenta atrás de unidades,
        que no lo sería.
      </p>
      <p>
        Si te interesa probar, la versión más corta es un solo producto durante diez minutos, sin compromiso más allá de
        ese día.
      </p>

      <h2>Qué obtiene una tienda</h2>
      <ul>
        <li>Compradores con intención: han leído una comparación de precios y el razonamiento de la recomendación antes de hacer clic.</li>
        <li>Productos mostrados con tus condiciones de envío y devolución, para que el clic sea informado y no un rebote.</li>
        <li>Un producto roto o agotado se retira sin que tengas que avisarnos.</li>
        <li>Sin pujas por marca, sin inyección de cupones, sin barras de herramientas, sin cookie-stuffing. El tráfico es editorial y orgánico.</li>
      </ul>

      <h2>Cómo nos llegan los datos</h2>
      <p>
        Un feed de productos estándar (CSV, TSV o XML por HTTPS) a través de tu red de afiliación, o una API documentada.
        Necesitamos título, precio, moneda, imagen, enlace directo, disponibilidad y, sobre todo, coste de envío y
        condiciones de devolución. Sin estos dos últimos un producto no puede ser candidato a Daily Drop, porque no
        publicaremos un precio que no sea el que alguien paga realmente.
      </p>
      <p>
        Un código de barras (GTIN, EAN o UPC) o la referencia del fabricante en cada fila marca una gran diferencia: es lo
        que nos permite comparar tu oferta con el mismo producto en otras tiendas.
      </p>

      <h2>Independencia editorial</h2>
      <p>
        La puntuación, los textos y la selección son nuestros. Publicamos los criterios y el razonamiento de cada
        selección, y decimos claramente cuándo falta una señal en lugar de rellenar el hueco. Si un descuento no puede
        verificarse, no se muestra.
      </p>

      <h2>Hablemos</h2>
      <p>
        Colaboraciones con afiliados y tiendas: <a href="mailto:info@onedailydrop.com">info@onedailydrop.com</a>. Cuéntanos
        la red, los mercados y dónde está el feed, y te diremos con honestidad si el catálogo encaja.
      </p>
    </Prose>
  );
}
