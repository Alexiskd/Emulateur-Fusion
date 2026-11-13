/** Puissances en MW, rendements et fractions entre 0 et 1. */
export interface PowerParams {
  /** Puissance de fusion D-T */
  fusionPower: number;
  /** Puissance de chauffage auxiliaire injectée dans le plasma */
  auxHeatingPower: number;
  /** Rendement « prise murale » des systèmes de chauffage */
  heatingEfficiency: number;
  /** Multiplication de l'énergie des neutrons dans la couverture */
  blanketMultiplication: number;
  /** Rendement du cycle thermodynamique (chaleur → électricité) */
  thermalEfficiency: number;
  /** Consommation électrique de la cryogénie */
  cryoPower: number;
  /** Consommation électrique des alimentations des aimants */
  magnetPower: number;
  /** Pompage du caloporteur, en fraction de la puissance thermique */
  pumpingFraction: number;
  /** Autres auxiliaires (cycle du tritium, vide, services), en fraction de l'électricité brute */
  otherFraction: number;
  /** Surface de la première paroi (m²), fournie par le modèle 3D */
  firstWallArea?: number;
}

export interface PowerBalance {
  neutronPower: number;
  alphaPower: number;
  blanketPower: number;
  thermalPower: number;
  grossElectric: number;
  rejectedHeat: number;
  recirculating: {
    heating: number;
    cryo: number;
    magnets: number;
    pumping: number;
    other: number;
    total: number;
  };
  netElectric: number;
  /** Gain du plasma Q = fusion / chauffage injecté */
  plasmaGain: number;
  /** Gain d'ingénierie = électricité brute / électricité recirculée */
  engineeringGain: number;
  recirculatingFraction: number;
  /** Rendement global = électricité nette / puissance de fusion */
  plantEfficiency: number;
  /** Charge neutronique moyenne sur la première paroi (MW/m²) */
  neutronWallLoad: number | null;
}
