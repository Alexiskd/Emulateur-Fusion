# Émulateur fusion

Modélisation 3D paramétrique et décomposition d'un réacteur à fusion nucléaire (tokamak).

- **`apps/api`** — NestJS. Calcule le modèle : frontière plasma en « D », empilement radial
  des couches, bobines, volumes et masses estimés.
- **`apps/web`** — React + Three.js (react-three-fiber). Affiche la machine en 3D avec vue en
  coupe, vue éclatée, arbre des composants et réglage des paramètres en direct.

## Lancer

```bash
npm install
npm run dev      # API sur http://localhost:3000/api, front sur http://localhost:5173
npm test         # tests du moteur de géométrie
```

## API

| Méthode | Route | Rôle |
| --- | --- | --- |
| GET | `/api/reactors/presets` | Machines types (ITER, DEMO, compact) |
| GET | `/api/reactors/presets/:id` | Modèle complet d'une machine type |
| POST | `/api/reactors/build` | Modèle complet à partir de paramètres libres |
| POST | `/api/power-balance` | Bilan de puissance : fusion → chaleur → électricité nette |
| POST | `/api/simulation` | Simulation d'une impulsion : séries temporelles et bilan du cycle |
| POST | `/api/energy-transfer` | Chaîne de transfert d'énergie : puissances et flux du schéma |
| POST | `/api/energy-transfer/optimize` | Meilleur réglage de chaque caloporteur |
| GET | `/api/energy-transfer/coolants` | Caloporteurs et leurs limites |
| POST | `/api/plant/evaluate` | Performance d'un réacteur, de la géométrie à l'électricité nette |
| POST | `/api/plant/optimize` | Optimisation de toute la chaîne (bouton « Optimiser le réacteur ») |
| GET | `/api/references` | Projets open-source de référence |

Chaque composant est renvoyé sous forme de profil poloïdal `(r, z)` en mètres. Le front le met
en révolution autour de l'axe vertical (ou l'extrude et le répète, pour les bobines toroïdales).

## Modèle

Frontière plasma (paramétrisation de Miller) :
`R(θ) = R₀ + a·cos(θ + δ·sin θ)`, `Z(θ) = κ·a·sin θ`.
Les couches (première paroi, couverture, blindage, enceinte, bobines) sont des décalages
normaux successifs de cette courbe. Les volumes viennent du théorème de Pappus-Guldin ; les
masses utilisent des masses volumiques moyennes indicatives.

### Bilan énergétique

Bilan stationnaire d'une centrale D-T : les neutrons (14,1 MeV sur 17,6 MeV par réaction)
déposent leur énergie, multipliée, dans la couverture ; alphas et chauffage finissent en chaleur
sur les parois. `électricité brute = rendement du cycle × puissance thermique`, puis on retire
les auxiliaires (chauffage du plasma, pompage, cryogénie, aimants, divers) pour obtenir
l'électricité nette. La charge neutronique sur la paroi relie ce bilan au modèle 3D.

### Simulation de fonctionnement

Modèle 0D d'une impulsion en six phases (pré-magnétisation, montée du courant, chauffage,
plateau de combustion, descente, repos). L'énergie thermique du plasma suit
`dW/dt = P_alpha + P_chauffage + P_ohmique − W/τ_E`, la puissance de fusion suit la réactivité
D-T (ajustement de Bosch-Hale) et `τ_E` se dégrade avec la puissance. Le modèle est calé pour
retrouver sur le plateau la puissance de fusion du bilan énergétique. Le front rejoue le cycle :
courbes, et vue 3D animée (plasma, solénoïde, bobines, couverture).

### Transfert d'énergie et optimisation

Schéma complet du plasma au réseau : couverture et divertor, circuit primaire, générateur de
vapeur, turbine et alternateur, condenseur et tours, poste électrique et consommations internes.
Ici le rendement et le pompage ne sont plus des hypothèses, ils découlent des températures :

- rendement du cycle = 73 % du rendement de Carnot entre la température moyenne du caloporteur
  (moins le pincement de l'échangeur) et le condenseur ;
- pompage primaire proportionnel au cube du débit, donc en `1/ΔT³` ;
- consommation du refroidissement inversement proportionnelle à l'écart condenseur-ambiante.

L'optimiseur balaie les températures d'entrée, de sortie et de condensation de chaque caloporteur
(eau pressurisée, hélium, sel fondu) dans les limites des matériaux, et retient le réglage qui
maximise l'électricité nette.

### Optimisation du réacteur entier

Le bouton « Optimiser le réacteur » relie tous les maillons par des lois d'échelle classiques :
champ sur l'axe (limite du conducteur et section des bobines), courant plasma (facteur de sécurité
q = 3), densité (85 % de la limite de Greenwald), pression (bêta normalisé de 2), puissance de
fusion (réactivité D-T), chauffage nécessaire (confinement IPB98(y,2)), puis la chaîne de
transfert jusqu'à l'électricité nette. La machine type ITER retrouve ainsi 5,3 T, 15 MA et
environ 500 MW.

L'optimiseur fait varier la taille, le rapport d'aspect, la couverture et le blindage, calcule
l'épaisseur de bobine nécessaire, respecte la charge neutronique (2 MW/m²), la puissance au
divertor (17 MW/m) et la stabilité verticale, puis ajuste les températures du circuit. Trois
objectifs au choix : rendement de la chaîne, électricité nette, électricité par tonne.

C'est un modèle pédagogique : formes simplifiées, pas un outil de dimensionnement.

## Références

Démarche inspirée de [Bluemira](https://github.com/Fusion-Power-Plant-Framework/bluemira) et
[Paramak](https://github.com/fusion-energy/paramak). Voir aussi
[cad_to_dagmc](https://github.com/fusion-energy/cad_to_dagmc),
[fusion-energy](https://github.com/fusion-energy) et
[fusion-open-source](https://github.com/kripnerl/fusion-open-source).

Bilan énergétique inspiré de [ukaea/powerbalance](https://github.com/ukaea/powerbalance),
[PROCESS](https://github.com/ukaea/PROCESS), [FUSE.jl](https://github.com/ProjectTorreyPines/FUSE.jl),
[pathsim-fusion](https://github.com/pathsim/pathsim-fusion) et des outils de [1cFE](https://github.com/1cFE).

## Déploiement Render

Un seul service web : NestJS sert l'API et le front compilé. `render.yaml` contient la
configuration (build `npm install --include=dev && npm run build`, démarrage `npm start`).
