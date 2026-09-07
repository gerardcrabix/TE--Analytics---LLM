// Static, non-personal reference data: ISO country codes -> French display
// names, and approximate lat/lon centroids used to place bubbles on the map.
// None of this is derived from the imported employee/usage files.

export const COUNTRY_NAMES = {
  MX: 'Mexique', PL: 'Pologne', AE: 'Émirats arabes unis', DE: 'Allemagne',
  ID: 'Indonésie', FR: 'France', US: 'États-Unis', AU: 'Australie', CN: 'Chine',
  BR: 'Brésil', AR: 'Argentine', PH: 'Philippines', GB: 'Royaume-Uni', IN: 'Inde',
  IE: 'Irlande', CA: 'Canada', IT: 'Italie', SA: 'Arabie saoudite', SG: 'Singapour',
  SE: 'Suède', BE: 'Belgique', CH: 'Suisse', HK: 'Hong Kong', VN: 'Vietnam',
  JP: 'Japon', PE: 'Pérou', ES: 'Espagne', HU: 'Hongrie', CL: 'Chili', AT: 'Autriche',
  UA: 'Ukraine', MA: 'Maroc', PT: 'Portugal', NL: 'Pays-Bas', KR: 'Corée du Sud',
  CO: 'Colombie', RO: 'Roumanie', NZ: 'Nouvelle-Zélande', DK: 'Danemark',
  CZ: 'Tchéquie', TH: 'Thaïlande', NO: 'Norvège', FI: 'Finlande', IL: 'Israël',
  MY: 'Malaisie', TW: 'Taïwan', CR: 'Costa Rica',
};

export const COUNTRY_CENTROIDS = {
  MX: [23.6, -102.5], PL: [52, 19.1], AE: [24, 54], DE: [51.1, 10.4], ID: [-2.5, 118],
  FR: [46.6, 2.2], US: [39.8, -98.6], AU: [-25.3, 133.8], CN: [35.9, 104.2],
  BR: [-14.2, -51.9], AR: [-38.4, -63.6], PH: [12.9, 121.8], GB: [54, -2], IN: [21, 78],
  IE: [53.4, -8], CA: [56.1, -106.3], IT: [42.8, 12.6], SA: [24, 45], SG: [1.35, 103.8],
  SE: [60.1, 18.6], BE: [50.5, 4.5], CH: [46.8, 8.2], HK: [22.3, 114.2], VN: [16, 108],
  JP: [36.2, 138.3], PE: [-9.2, -75], ES: [40.5, -3.7], HU: [47.2, 19.5], CL: [-35.7, -71.5],
  AT: [47.5, 14.6], UA: [48.4, 31.2], MA: [31.8, -7.1], PT: [39.4, -8.2], NL: [52.1, 5.3],
  KR: [35.9, 127.8], CO: [4.6, -74.3], RO: [45.9, 25], NZ: [-41, 174.9], DK: [56.3, 9.5],
  CZ: [49.8, 15.5], TH: [15.9, 100.9], NO: [60.5, 8.5], FI: [64.9, 26], IL: [31, 34.9],
  MY: [4.2, 101.9], TW: [23.7, 121], CR: [9.7, -83.8],
};

export const REGION_CENTROIDS = {
  AMER: [40, -95],
  EMEA: [45, 15],
  APANZ: [10, 105],
};

export const FR_MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

export function countryLabel(code) {
  return COUNTRY_NAMES[code] || code;
}
