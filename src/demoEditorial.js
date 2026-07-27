const reasons = {
  D001: "Small enough to keep in the car, with a light for crumbs and dirt hiding under seats.",
  D002: "An easy way to add café-style foam to coffee or matcha without another countertop appliance.",
  D003: "A practical four-pack for controlling lamps and small appliances without replacing existing outlets.",
  D004: "Useful for single-serve smoothies when a full-size blender feels like more cleanup than the drink is worth.",
  D005: "A filtered, continuously moving water source that can make daily hydration easier for cats and small dogs.",
  D006: "Keeps a phone visible for navigation while leaving the screen easy to rotate and reposition.",
  D007: "A compact repair kit for the tiny screws found in laptops, glasses, controllers and other electronics.",
  D008: "Compression helps separate outfits and reclaim space without turning a suitcase into a jumble.",
  D009: "Combines task lighting and two charging options, which helps clear cables and clutter from a small desk.",
  D010: "A straightforward tool for portioning ingredients accurately without taking up much kitchen space.",
  D011: "A portable strength-training set that covers several resistance levels without requiring bulky weights.",
  D012: "A space-conscious way to get crisp results for one or two people without heating a full oven.",
  D013: "Adds motion alerts and night visibility to an indoor room without a complicated security installation.",
  D014: "Designed for everyday commuting, with insulation for temperature control and a lid intended to reduce spills.",
  D015: "The quiet buttons suit shared workspaces, while the shaped body offers more support than a basic travel mouse.",
  D016: "A portable speaker that is easier to use outdoors or near water than a standard indoor-only model.",
  D017: "Helpful for keeping meal times consistent when work, errands or travel make manual feeding unpredictable.",
  D018: "Adds automatic light to closets, cabinets or stairs without new wiring, and the three-pack covers multiple spots.",
  D019: "Includes two batteries so common household drilling and fastening jobs do not stop for a recharge.",
  D020: "A simple comfort upgrade for long periods in an office chair or car without replacing the whole seat.",
  D021: "Raises a laptop to a more comfortable viewing height and folds away when the desk or bag needs the space.",
  D022: "Multiple heat levels make it easier to choose gentle or stronger warmth for short comfort sessions.",
  D023: "Airtight matching containers help organize leftovers and pantry staples while reducing disposable bag use.",
  D024: "Compact backup power with USB-C fast charging is useful for commutes, flights and long days away from an outlet."
};

const fallback = product => {
  const category = String(product?.category || "everyday").toLowerCase();
  return `A practical ${category} option chosen for clear everyday usefulness and straightforward features.`;
};

const reasonFor = product => reasons[String(product?.external_id || "")] || fallback(product);

module.exports = { reasons, reasonFor };
