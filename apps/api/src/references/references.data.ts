export interface OpenSourceReference {
  name: string;
  organization: string;
  url: string;
  /** geometry : modélisation 3D · power : conversion d'énergie · systems : codes systèmes · economics : coûts */
  category: 'geometry' | 'power' | 'systems' | 'economics';
  description: string;
  /** Ce que l'application en reprend, ou la passerelle envisageable. */
  relation: string;
}

export const REFERENCES: OpenSourceReference[] = [
  {
    name: 'Bluemira',
    category: 'systems',
    organization: 'Fusion-Power-Plant-Framework',
    url: 'https://github.com/Fusion-Power-Plant-Framework/bluemira',
    description: 'Outil de conception intégré et interdisciplinaire pour les futurs réacteurs à fusion (tokamaks, stellarators).',
    relation: 'Inspire la démarche (paramètres → empilement radial → composants) ; son module balance_of_plant modélise le transfert thermique et la conversion électrique.',
  },
  {
    name: 'Paramak',
    category: 'geometry',
    organization: 'fusion-energy',
    url: 'https://github.com/fusion-energy/paramak',
    description: 'Bibliothèque Python de création rapide de modèles CAO 3D paramétriques de réacteurs à fusion.',
    relation: 'Inspire la géométrie : profils poloïdaux paramétriques mis en révolution autour de l\'axe.',
  },
  {
    name: 'CAD to DAGMC',
    category: 'geometry',
    organization: 'fusion-energy',
    url: 'https://github.com/fusion-energy/cad_to_dagmc',
    description: 'Conversion de géométries CAO (STEP) ou d\'assemblages CadQuery au format DAGMC pour la neutronique (OpenMC).',
    relation: 'Suite possible : exporter le modèle en STEP via Paramak, puis le convertir pour un calcul neutronique.',
  },
  {
    name: 'Fusion Energy',
    category: 'geometry',
    organization: 'fusion-energy',
    url: 'https://github.com/fusion-energy',
    description: 'Organisation regroupant des projets open-source d\'analyse et de simulation de l\'énergie de fusion.',
    relation: 'Source d\'outils complémentaires (ateliers de neutronique, utilitaires neutrons de fusion).',
  },
  {
    name: 'fusion-open-source',
    category: 'systems',
    organization: 'kripnerl',
    url: 'https://github.com/kripnerl/fusion-open-source',
    description: 'Liste organisée de bibliothèques open-source pour la fusion (PlasmaPy, OMAS, Cherab…).',
    relation: 'Point d\'entrée pour étendre l\'application vers la physique du plasma ou les diagnostics.',
  },
  {
    name: 'Power Balance Models',
    category: 'power',
    organization: 'ukaea',
    url: 'https://github.com/ukaea/powerbalance',
    description: 'Modèles OpenModelica avec API Python (UKAEA) : puissance nette d\'un tokamak, consommations des aimants, du chauffage et de la cryogénie déduites de la production brute.',
    relation: 'Inspire le bilan énergétique : électricité brute moins auxiliaires = électricité nette.',
  },
  {
    name: 'pathsim-fusion',
    category: 'power',
    organization: 'pathsim',
    url: 'https://github.com/pathsim/pathsim-fusion',
    description: 'Boîte à outils de simulation par blocs pour le cycle du combustible et les systèmes de conversion d\'énergie (Balance of Plant).',
    relation: 'Suite possible : passer du bilan stationnaire à une simulation dynamique par blocs.',
  },
  {
    name: 'FUSE.jl',
    category: 'systems',
    organization: 'ProjectTorreyPines',
    url: 'https://github.com/ProjectTorreyPines/FUSE.jl',
    description: 'Moteur de synthèse en Julia couplant physique des plasmas, ingénierie du réacteur et conversion d\'énergie.',
    relation: 'Référence pour coupler la géométrie et le bilan de puissance dans un même modèle.',
  },
  {
    name: 'PROCESS',
    category: 'systems',
    organization: 'ukaea',
    url: 'https://github.com/ukaea/PROCESS',
    description: 'Code système de l\'UKAEA : dimensionne et optimise une centrale à fusion complète, jusqu\'à la puissance électrique nette.',
    relation: 'Inspire la chaîne de calcul : puissance thermique → rendement du cycle → puissance nette.',
  },
  {
    name: 'Tokamak-TEA-Tool',
    category: 'economics',
    organization: '1cFE',
    url: 'https://github.com/1cFE',
    description: 'Outil Python de l\'initiative 1¢/kWh Fusion Energy : dimensionnement d\'un tokamak D-T, flux d\'énergie et coût actualisé de l\'électricité (LCOE).',
    relation: 'Suite possible : ajouter une estimation du coût de l\'électricité.',
  },
];
