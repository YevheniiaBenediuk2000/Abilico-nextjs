const makiUrl = (name) =>
    new URL(`../../assets/icons/maki/${encodeURIComponent(name)}.svg`, import.meta.url).href;

// --- priority: known "poi-ish" keys first ---
const TAG_PRIORITY = [
    "amenity","shop","tourism","leisure","healthcare","sport",
    "office","craft","historic","man_made","military",
    "aeroway","railway","public_transport","natural","emergency","landuse","barrier"
];

// normalize e.g. "fast_food" ↔ "fast-food"
function variants(v) {
    const x = String(v || "").trim();
    const out = new Set([
        x, x.toLowerCase(),
        x.replace(/_/g, "-").toLowerCase(),
        x.replace(/-/g, "_").toLowerCase(),
    ]);
    if (x === "fast_food") out.add("fast-food");
    if (x === "ice_cream") out.add("ice-cream");
    return [...out];
}

// === Mappings (extend anytime) ===
const AMENITY_TO_MAKI = {
    // health
    pharmacy:"pharmacy", hospital:"hospital", clinic:"hospital",
    doctors:"doctor", dentist:"dentist", blood_bank:"blood-bank",
    // money/admin/safety
    bank:"bank", atm:"bank", bureau_de_change:"bank",
    post_office:"post", parcel_locker:"post", police:"police",
    courthouse:"town-hall", townhall:"town-hall",
    // food & drink
    cafe:"cafe", restaurant:"restaurant", fast_food:"fast-food",
    bar:"bar", pub:"beer", food_court:"restaurant",
    // water & toilets
    toilets:"toilet", drinking_water:"drinking-water", water_point:"drinking-water",
    // mobility
    fuel:"fuel", charging_station:"charging-station",
    car_rental:"car-rental", parking:"parking",
    parking_entrance:"parking-garage", parking_space:"parking",
    // learning & culture
    library:"library", theatre:"theatre", cinema:"cinema",
    arts_centre:"art-gallery", marketplace:"shop",
    university:"college", college:"college", school:"school",
    kindergarten:"school", childcare:"school",
    // worship
    place_of_worship:"place-of-worship", monastery:"religious-christian",
    // civic
    fire_station:"fire-station", bus_station:"bus",
    // social
    social_facility:"heart", veterinary:"veterinary", coworking_space:"commercial",
    // misc
    recycling:"recycling", waste_disposal:"waste-basket",
    car_wash:"car", vehicle_inspection:"car-repair",
    bicycle_rental:"bicycle-share", bicycle_repair_station:"bicycle",
    nightclub:"nightclub", internet_cafe:"mobile-phone",
};

const SHOP_TO_MAKI = {
    supermarket:"grocery", convenience:"convenience", bakery:"bakery",
    clothes:"clothing-store", hardware:"hardware", jewelry:"jewelry-store",
    florist:"florist", furniture:"furniture", alcohol:"alcohol-shop",
};

const TOURISM_TO_MAKI = {
    hotel:"lodging", attraction:"attraction", museum:"museum",
    gallery:"art-gallery", zoo:"zoo", theme_park:"amusement-park",
    aquarium:"aquarium", viewpoint:"viewpoint",
};

const LEISURE_TO_MAKI = {
    park:"park", playground:"playground", pitch:"pitch",
    stadium:"stadium", swimming_pool:"swimming",
    fitness_centre:"fitness-centre", dog_park:"dog-park",
    marina:"harbor", ice_rink:"skiing", skate_park:"skateboard",
};

const SPORT_TO_MAKI = {
    soccer:"soccer", tennis:"tennis", basketball:"basketball",
    baseball:"baseball", golf:"golf", volleyball:"volleyball",
    table_tennis:"table-tennis", cricket:"cricket",
};

// Extra broad categories: give them generic-but-reasonable icons
const OFFICE_TO_MAKI        = { "*":"commercial" };
const CRAFT_TO_MAKI         = { "*":"workshop"    };
const HISTORIC_TO_MAKI      = { "*":"monument"    };
const MAN_MADE_TO_MAKI      = { "*":"industry"    };
const MILITARY_TO_MAKI      = { "*":"danger"      };
const AEROWAY_TO_MAKI       = { aerodrome:"airport", terminal:"airport", gate:"airport", "*":"airport" };
const RAILWAY_TO_MAKI       = { station:"rail", halt:"rail", tram_stop:"rail", "*":"rail" };
const PUBTRANS_TO_MAKI      = { station:"bus", platform:"bus", stop_position:"bus", stop_area:"bus", "*":"bus" };
const NATURAL_TO_MAKI       = { peak:"mountain", cave_entrance:"cave", spring:"water", tree:"park", "*":"park" };
const EMERGENCY_TO_MAKI     = { phone:"telephone", defibrillator:"first-aid", "*":"first-aid" };
const LANDUSE_TO_MAKI       = { industrial:"industry", retail:"shop", commercial:"commercial", forest:"park", "*":"park" };
const BARRIER_TO_MAKI       = { gate:"barrier", lift_gate:"barrier", bollard:"barrier", "*":"barrier" };

function refineByReligion(base, tags) {
    if (base !== "place-of-worship") return base;
    const relMap = {
        christian:"religious-christian",
        jewish:"religious-jewish",
        muslim:"religious-muslim",
        buddhist:"religious-buddhist",
        shinto:"religious-shinto",
    };
    return relMap[tags.religion] || base;
}

function mapFrom(dict, raw) {
    if (!raw) return null;
    for (const v of variants(raw)) {
        if (dict[v]) return dict[v];
    }
    return dict["*"] || null;
}

function categoryFallback(key) {
    return (
        (key === "shop" && "shop") ||
        (key === "tourism" && "attraction") ||
        (key === "leisure" && "park") ||
        (key === "healthcare" && "hospital") ||
        (key === "sport" && "pitch") ||
        "information"
    );
}

export function iconFor(tags = {}) {
    // Build a search order: preferred keys first, then any remaining keys present on the feature
    const extraKeys = Object.keys(tags).filter(k => !TAG_PRIORITY.includes(k));
    const order = [...TAG_PRIORITY, ...extraKeys];

    for (const key of order) {
        const raw = tags[key];
        if (!raw) continue;

        // 1) Amenity with special handling & variants
        if (key === "amenity") {
            const direct = AMENITY_TO_MAKI[raw] || AMENITY_TO_MAKI[variants(raw).find(v => AMENITY_TO_MAKI[v])];
            if (direct) {
                const name = raw === "place_of_worship"
                    ? refineByReligion("place-of-worship", tags)
                    : direct;
                return makiUrl(name);
            }
        }

        // 2) Category dictionaries
        if (key === "shop")     { const m = mapFrom(SHOP_TO_MAKI, raw);     if (m) return makiUrl(m); return makiUrl("shop"); }
        if (key === "tourism")  { const m = mapFrom(TOURISM_TO_MAKI, raw);  if (m) return makiUrl(m); return makiUrl("attraction"); }
        if (key === "leisure")  { const m = mapFrom(LEISURE_TO_MAKI, raw);  if (m) return makiUrl(m); return makiUrl("park"); }
        if (key === "healthcare"){ if (/^(hospital|clinic)$/i.test(raw)) return makiUrl("hospital"); return makiUrl("pharmacy"); }
        if (key === "sport")    { const m = mapFrom(SPORT_TO_MAKI, raw);    if (m) return makiUrl(m); return makiUrl("pitch"); }

        if (key === "office")         { const m = mapFrom(OFFICE_TO_MAKI, raw);        if (m) return makiUrl(m); }
        if (key === "craft")          { const m = mapFrom(CRAFT_TO_MAKI, raw);         if (m) return makiUrl(m); }
        if (key === "historic")       { const m = mapFrom(HISTORIC_TO_MAKI, raw);      if (m) return makiUrl(m); }
        if (key === "man_made")       { const m = mapFrom(MAN_MADE_TO_MAKI, raw);      if (m) return makiUrl(m); }
        if (key === "military")       { const m = mapFrom(MILITARY_TO_MAKI, raw);      if (m) return makiUrl(m); }
        if (key === "aeroway")        { const m = mapFrom(AEROWAY_TO_MAKI, raw);       if (m) return makiUrl(m); }
        if (key === "railway")        { const m = mapFrom(RAILWAY_TO_MAKI, raw);       if (m) return makiUrl(m); }
        if (key === "public_transport"){const m = mapFrom(PUBTRANS_TO_MAKI, raw);      if (m) return makiUrl(m); }
        if (key === "natural")        { const m = mapFrom(NATURAL_TO_MAKI, raw);       if (m) return makiUrl(m); }
        if (key === "emergency")      { const m = mapFrom(EMERGENCY_TO_MAKI, raw);     if (m) return makiUrl(m); }
        if (key === "landuse")        { const m = mapFrom(LANDUSE_TO_MAKI, raw);       if (m) return makiUrl(m); }
        if (key === "barrier")        { const m = mapFrom(BARRIER_TO_MAKI, raw);       if (m) return makiUrl(m); }

        // 3) Generic fallback for *any* other key:
        // try to use the value directly if a matching maki icon exists in your set
        for (const v of variants(raw)) {
            try {
                // if this URL exists in your bundled icons, use it
                return makiUrl(v);
            } catch (_) {
                // ignore resolution errors; will fall back below
            }
        }

        // 4) Fallback per-category (if it's one we know), else final fallback
        if (TAG_PRIORITY.includes(key)) return makiUrl(categoryFallback(key));
    }

    // Last resort
    return makiUrl("information");
}