import { PowerBalance, PowerParams } from './power.types';

/** Part de l'énergie d'une réaction D-T emportée par le neutron : 14,1 MeV sur 17,6 MeV. */
export const NEUTRON_FRACTION = 14.1 / 17.6;

/**
 * Bilan de puissance stationnaire d'une centrale à fusion D-T, dans l'esprit des codes
 * systèmes (PROCESS, module balance_of_plant de Bluemira, ukaea/powerbalance) :
 * fusion → chaleur → électricité brute → électricité nette après auxiliaires.
 */
export function computePowerBalance(p: PowerParams): PowerBalance {
  const neutronPower = p.fusionPower * NEUTRON_FRACTION;
  const alphaPower = p.fusionPower - neutronPower;

  // Les neutrons déposent leur énergie (multipliée) dans la couverture ; la puissance des
  // alphas et du chauffage finit en chaleur sur la première paroi et le divertor.
  const blanketPower = neutronPower * p.blanketMultiplication;
  const thermalPower = blanketPower + alphaPower + p.auxHeatingPower;

  const grossElectric = thermalPower * p.thermalEfficiency;

  const heating = p.auxHeatingPower / p.heatingEfficiency;
  const pumping = thermalPower * p.pumpingFraction;
  const other = grossElectric * p.otherFraction;
  const total = heating + p.cryoPower + p.magnetPower + pumping + other;

  const netElectric = grossElectric - total;

  return {
    neutronPower,
    alphaPower,
    blanketPower,
    thermalPower,
    grossElectric,
    rejectedHeat: thermalPower - grossElectric,
    recirculating: { heating, cryo: p.cryoPower, magnets: p.magnetPower, pumping, other, total },
    netElectric,
    plasmaGain: p.fusionPower / p.auxHeatingPower,
    engineeringGain: grossElectric / total,
    recirculatingFraction: total / grossElectric,
    plantEfficiency: netElectric / p.fusionPower,
    neutronWallLoad: p.firstWallArea ? neutronPower / p.firstWallArea : null,
  };
}
