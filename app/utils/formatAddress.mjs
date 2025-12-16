/**
 * Formats a single-line address from OSM/Nominatim tags
 * @param {Record<string, any>} tags - OSM tags object
 * @returns {string | null} Formatted address string or null if no address data
 */
export const COUNTRY_NAME_MAP = {
    AF: "Afghanistan",
    AL: "Albania",
    DZ: "Algeria",
    AD: "Andorra",
    AO: "Angola",
    AG: "Antigua and Barbuda",
    AR: "Argentina",
    AM: "Armenia",
    AU: "Australia",
    AT: "Austria",
    AZ: "Azerbaijan",
    BS: "Bahamas",
    BH: "Bahrain",
    BD: "Bangladesh",
    BB: "Barbados",
    BY: "Belarus",
    BE: "Belgium",
    BZ: "Belize",
    BJ: "Benin",
    BT: "Bhutan",
    BO: "Bolivia",
    BA: "Bosnia and Herzegovina",
    BW: "Botswana",
    BR: "Brazil",
    BN: "Brunei",
    BG: "Bulgaria",
    BF: "Burkina Faso",
    BI: "Burundi",
    KH: "Cambodia",
    CM: "Cameroon",
    CA: "Canada",
    CV: "Cape Verde",
    CF: "Central African Republic",
    TD: "Chad",
    CL: "Chile",
    CN: "China",
    CO: "Colombia",
    KM: "Comoros",
    CG: "Congo",
    CD: "Congo (Democratic Republic)",
    CR: "Costa Rica",
    CI: "Côte d’Ivoire",
    HR: "Croatia",
    CU: "Cuba",
    CY: "Cyprus",
    CZ: "Czech Republic",
    DK: "Denmark",
    DJ: "Djibouti",
    DM: "Dominica",
    DO: "Dominican Republic",
    EC: "Ecuador",
    EG: "Egypt",
    SV: "El Salvador",
    GQ: "Equatorial Guinea",
    ER: "Eritrea",
    EE: "Estonia",
    SZ: "Eswatini",
    ET: "Ethiopia",
    FJ: "Fiji",
    FI: "Finland",
    FR: "France",
    GA: "Gabon",
    GM: "Gambia",
    GE: "Georgia",
    DE: "Germany",
    GH: "Ghana",
    GR: "Greece",
    GD: "Grenada",
    GT: "Guatemala",
    GN: "Guinea",
    GW: "Guinea-Bissau",
    GY: "Guyana",
    HT: "Haiti",
    HN: "Honduras",
    HU: "Hungary",
    IS: "Iceland",
    IN: "India",
    ID: "Indonesia",
    IR: "Iran",
    IQ: "Iraq",
    IE: "Ireland",
    IL: "Israel",
    IT: "Italy",
    JM: "Jamaica",
    JP: "Japan",
    JO: "Jordan",
    KZ: "Kazakhstan",
    KE: "Kenya",
    KI: "Kiribati",
    KP: "Korea (North)",
    KR: "Korea (South)",
    KW: "Kuwait",
    KG: "Kyrgyzstan",
    LA: "Laos",
    LV: "Latvia",
    LB: "Lebanon",
    LS: "Lesotho",
    LR: "Liberia",
    LY: "Libya",
    LI: "Liechtenstein",
    LT: "Lithuania",
    LU: "Luxembourg",
    MG: "Madagascar",
    MW: "Malawi",
    MY: "Malaysia",
    MV: "Maldives",
    ML: "Mali",
    MT: "Malta",
    MH: "Marshall Islands",
    MR: "Mauritania",
    MU: "Mauritius",
    MX: "Mexico",
    FM: "Micronesia",
    MD: "Moldova",
    MC: "Monaco",
    MN: "Mongolia",
    ME: "Montenegro",
    MA: "Morocco",
    MZ: "Mozambique",
    MM: "Myanmar",
    NA: "Namibia",
    NR: "Nauru",
    NP: "Nepal",
    NL: "Netherlands",
    NZ: "New Zealand",
    NI: "Nicaragua",
    NE: "Niger",
    NG: "Nigeria",
    MK: "North Macedonia",
    NO: "Norway",
    OM: "Oman",
    PK: "Pakistan",
    PW: "Palau",
    PS: "Palestine",
    PA: "Panama",
    PG: "Papua New Guinea",
    PY: "Paraguay",
    PE: "Peru",
    PH: "Philippines",
    PL: "Poland",
    PT: "Portugal",
    QA: "Qatar",
    RO: "Romania",
    RU: "Russia",
    RW: "Rwanda",
    KN: "Saint Kitts and Nevis",
    LC: "Saint Lucia",
    VC: "Saint Vincent and the Grenadines",
    WS: "Samoa",
    SM: "San Marino",
    ST: "São Tomé and Príncipe",
    SA: "Saudi Arabia",
    SN: "Senegal",
    RS: "Serbia",
    SC: "Seychelles",
    SL: "Sierra Leone",
    SG: "Singapore",
    SK: "Slovakia",
    SI: "Slovenia",
    SB: "Solomon Islands",
    SO: "Somalia",
    ZA: "South Africa",
    SS: "South Sudan",
    ES: "Spain",
    LK: "Sri Lanka",
    SD: "Sudan",
    SR: "Suriname",
    SE: "Sweden",
    CH: "Switzerland",
    SY: "Syria",
    TJ: "Tajikistan",
    TZ: "Tanzania",
    TH: "Thailand",
    TL: "Timor-Leste",
    TG: "Togo",
    TO: "Tonga",
    TT: "Trinidad and Tobago",
    TN: "Tunisia",
    TR: "Türkiye",
    TM: "Turkmenistan",
    TV: "Tuvalu",
    UG: "Uganda",
    UA: "Ukraine",
    AE: "United Arab Emirates",
    GB: "United Kingdom",
    US: "United States",
    UY: "Uruguay",
    UZ: "Uzbekistan",
    VU: "Vanuatu",
    VE: "Venezuela",
    VN: "Vietnam",
    YE: "Yemen",
    ZM: "Zambia",
    ZW: "Zimbabwe",
  
    // Optional: a few common “extras” you might see in OSM
    AX: "Åland Islands",
    GI: "Gibraltar",
    GG: "Guernsey",
    IM: "Isle of Man",
    JE: "Jersey",
    HK: "Hong Kong",
    MO: "Macau",
    PR: "Puerto Rico",
  }
  

export function formatAddressFromTags(tags) {
  if (!tags) return null;

  // Try OSM-style fields first, then normalized ones (handle case variations)
  const street =
    tags["addr:street"] ||
    tags.street ||
    tags.Street ||
    null;

  const housenumber =
    tags["addr:housenumber"] ||
    tags.housenumber ||
    tags.Housenumber ||
    null;

  const postcode =
    tags["addr:postcode"] ||
    tags.postcode ||
    tags.Postcode ||
    null;

  const city =
    tags["addr:city"] ||
    tags.city ||
    tags.City ||
    null;

  const countryCodeRaw =
    tags["addr:country"] ||
    tags["addr:country_code"] ||
    tags.countrycode ||
    tags.Countrycode ||
    tags.country_code ||
    null;

  const countryCode = countryCodeRaw
    ? String(countryCodeRaw).toUpperCase()
    : null;

  const countryName = countryCode
    ? COUNTRY_NAME_MAP[countryCode] || countryCode
    : null;

  const streetPart = [street, housenumber].filter(Boolean).join(" ");
  const cityPart = [postcode, city].filter(Boolean).join(" ");

  const parts = [streetPart, cityPart, countryName].filter(Boolean);

  if (!parts.length) return null;

  return parts.join(", ");
}

/**
 * Formats an "Area" line from OSM/Nominatim tags (district, county, etc.)
 * This is separate from the main address and can be displayed as secondary information
 * @param {Record<string, any>} tags - OSM tags object
 * @returns {string | null} Formatted area string or null if no area data
 */
export function formatAreaFromTags(tags) {
  if (!tags) return null;

  // Handle case variations
  const district =
    tags.district ||
    tags.District ||
    null;

  const county =
    tags.county ||
    tags.County ||
    null;

  const parts = [district, county].filter(Boolean);
  if (!parts.length) return null;

  return parts.join(", ");
}

