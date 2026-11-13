import type { FlowKind, TransferResult } from '../types';

const num = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });

const mw = (v: number) => `${Math.abs(v) < 10 ? dec.format(v) : num.format(v)} MW`;

const W = 1280;
const H = 640;
const NODE_W = 150;
const NODE_H = 62;

export const FLOW_COLORS: Record<FlowKind, string> = {
  fusion: '#ff4fd8',
  heat: '#e8833a',
  'low-heat': '#d9b44f',
  electric: '#3fbf7f',
  loss: '#7a7f8c',
};

const LEGEND: { kind: FlowKind; label: string }[] = [
  { kind: 'fusion', label: 'Énergie de fusion' },
  { kind: 'heat', label: 'Chaleur haute température' },
  { kind: 'low-heat', label: 'Chaleur basse température' },
  { kind: 'electric', label: 'Électricité' },
  { kind: 'loss', label: 'Rejet' },
];

type Side = 'left' | 'right' | 'top' | 'bottom';

/** Position (coin haut-gauche) de chaque bloc du schéma. */
const POSITIONS: Record<string, [number, number]> = {
  multiplication: [200, 16],
  fuel: [16, 150],
  plasma: [200, 150],
  blanket: [386, 70],
  divertor: [386, 236],
  primary: [572, 70],
  preheater: [758, 236],
  'steam-generator': [758, 70],
  turbine: [944, 150],
  condenser: [944, 300],
  'cooling-towers': [1114, 300],
  switchyard: [1114, 150],
  grid: [1114, 16],
  heating: [200, 540],
  cryo: [386, 540],
  pumps: [572, 540],
  magnets: [758, 540],
  'cooling-aux': [944, 540],
  other: [1114, 540],
};

/** Côtés de départ et d'arrivée des liaisons tracées en courbe. */
const ROUTES: Record<string, [Side, Side]> = {
  'fuel>plasma': ['right', 'left'],
  'heating>plasma': ['top', 'bottom'],
  'plasma>blanket': ['right', 'left'],
  'plasma>divertor': ['right', 'left'],
  'multiplication>blanket': ['right', 'top'],
  'blanket>primary': ['right', 'left'],
  'pumps>primary': ['top', 'bottom'],
  'primary>steam-generator': ['right', 'left'],
  'divertor>preheater': ['right', 'left'],
  'steam-generator>turbine': ['right', 'left'],
  'preheater>turbine': ['right', 'left'],
  'turbine>switchyard': ['right', 'left'],
  'turbine>condenser': ['bottom', 'top'],
  'condenser>cooling-towers': ['right', 'left'],
  'switchyard>grid': ['top', 'bottom'],
  'grid>switchyard': ['bottom', 'top'],
};

/** Consommateurs alimentés par le jeu de barres, en bas du schéma. */
const CONSUMERS = ['heating', 'cryo', 'pumps', 'magnets', 'cooling-aux', 'other'];
const BUS_Y = 478;
const BUS_X = W - 8;

function port(id: string, side: Side, shift = 0): [number, number] {
  const [x, y] = POSITIONS[id];
  if (side === 'left') return [x, y + NODE_H / 2 + shift];
  if (side === 'right') return [x + NODE_W, y + NODE_H / 2 + shift];
  if (side === 'top') return [x + NODE_W / 2 + shift, y];
  return [x + NODE_W / 2 + shift, y + NODE_H];
}

const NORMALS: Record<Side, [number, number]> = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };

interface NodeText {
  title: string;
  value: string;
  sub?: string;
  tone?: 'negative';
}

function describe(r: TransferResult): Record<string, NodeText> {
  const flow = (from: string, to: string) => r.flows.find((f) => f.from === from && f.to === to)?.value ?? 0;
  const rec = r.electric.recirculating;
  const d = r.design;
  const fusion = flow('fuel', 'plasma');
  const aux = flow('heating', 'plasma');
  return {
    fuel: { title: 'Combustible D-T', value: mw(fusion), sub: 'réactions de fusion' },
    plasma: { title: 'Plasma', value: mw(fusion + aux), sub: `Q = ${dec.format(fusion / aux)}` },
    multiplication: { title: 'Réactions couverture', value: mw(flow('multiplication', 'blanket')), sub: 'multiplication des neutrons' },
    blanket: { title: 'Couverture + paroi', value: mw(r.heat.blanket), sub: 'neutrons et rayonnement' },
    divertor: { title: 'Divertor', value: mw(r.heat.divertor), sub: 'eau à 150 °C' },
    primary: {
      title: 'Circuit primaire',
      value: mw(r.heat.primary),
      sub: `${num.format(d.inletTemperature)} → ${num.format(d.outletTemperature)} °C · ${num.format(r.primary.massFlow)} kg/s`,
    },
    preheater: { title: 'Réchauffeurs', value: mw(r.heat.divertor), sub: `rendement ${pct.format(r.cycle.divertorEfficiency)}` },
    'steam-generator': { title: 'Générateur de vapeur', value: mw(r.heat.primary), sub: r.coolant.label },
    turbine: { title: 'Turbine + alternateur', value: mw(r.electric.gross), sub: `rendement du cycle ${pct.format(r.cycle.efficiency)}` },
    condenser: { title: 'Condenseur', value: mw(r.heat.rejected), sub: `${dec.format(d.condenserTemperature)} °C` },
    'cooling-towers': { title: 'Tours de refroidissement', value: mw(r.heat.rejected), sub: `air à ${num.format(d.ambientTemperature)} °C` },
    switchyard: { title: 'Poste électrique', value: mw(r.electric.gross), sub: `${mw(rec.total)} recirculés` },
    grid:
      r.electric.net >= 0
        ? { title: 'Réseau', value: mw(r.electric.net), sub: 'électricité nette livrée' }
        : { title: 'Réseau', value: mw(r.electric.net), sub: 'soutirage au réseau', tone: 'negative' },
    heating: { title: 'Chauffage du plasma', value: mw(rec.heating), sub: `${mw(aux)} injectés` },
    cryo: { title: 'Cryogénie', value: mw(rec.cryo), sub: 'aimants à 4 K' },
    pumps: { title: 'Pompes primaires', value: mw(rec.primaryPumps), sub: `ΔT = ${num.format(r.primary.deltaT)} K` },
    magnets: { title: 'Alimentations aimants', value: mw(rec.magnets) },
    'cooling-aux': { title: 'Refroidissement', value: mw(rec.cooling), sub: 'tours et pompes' },
    other: { title: 'Autres auxiliaires', value: mw(rec.other), sub: 'tritium, vide, services' },
  };
}

export function EnergyDiagram({ result }: { result: TransferResult }) {
  const texts = describe(result);
  const maxFlow = Math.max(...result.flows.map((f) => f.value));
  const width = (value: number) => Math.max(1.5, (30 * value) / maxFlow);

  const curves = result.flows.flatMap((f) => {
    const route = ROUTES[`${f.from}>${f.to}`];
    if (!route) return [];
    const [a, b] = [port(f.from, route[0]), port(f.to, route[1])];
    const reach = 0.45 * Math.hypot(b[0] - a[0], b[1] - a[1]);
    const [na, nb] = [NORMALS[route[0]], NORMALS[route[1]]];
    const c1 = [a[0] + na[0] * reach, a[1] + na[1] * reach];
    const c2 = [b[0] + nb[0] * reach, b[1] + nb[1] * reach];
    // Point milieu de la courbe de Bézier, pour l'étiquette.
    const mid = [(a[0] + 3 * c1[0] + 3 * c2[0] + b[0]) / 8, (a[1] + 3 * c1[1] + 3 * c2[1] + b[1]) / 8];
    // Entre deux blocs voisins, la valeur figure déjà dans les blocs : pas d'étiquette.
    const labelled = reach / 0.45 > 110;
    return [{ f, d: `M${a} C${c1} ${c2} ${b}`, mid, labelled }];
  });

  // Jeu de barres : un tronc depuis le poste, puis une dérivation par consommateur.
  const recirculated = result.electric.recirculating.total;
  const [sx, sy] = port('switchyard', 'right');
  const firstDrop = port(CONSUMERS[0], 'top')[0];
  const drops = CONSUMERS.map((id) => {
    const value = result.flows.find((f) => f.from === 'switchyard' && f.to === id)?.value ?? 0;
    const [x, y] = port(id, 'top');
    return { id, value, x, y };
  }).filter((d) => d.value > 0);

  return (
    <svg className="diagram" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Schéma de la chaîne de transfert d'énergie">
      <g fill="none" strokeLinecap="butt">
        <path
          d={`M${sx},${sy} H${BUS_X} V${BUS_Y} H${firstDrop}`}
          stroke={FLOW_COLORS.electric}
          strokeWidth={width(recirculated)}
          strokeLinejoin="round"
          opacity={0.55}
        />
        {drops.map((d) => (
          <path key={d.id} d={`M${d.x},${BUS_Y} V${d.y}`} stroke={FLOW_COLORS.electric} strokeWidth={width(d.value)} opacity={0.8} />
        ))}
        {curves.map(({ f, d }) => (
          <path key={`${f.from}>${f.to}`} d={d} stroke={FLOW_COLORS[f.kind]} strokeWidth={width(f.value)} opacity={0.75} />
        ))}
      </g>

      {curves.filter((c) => c.labelled).map(({ f, mid }) => (
        <text key={`${f.from}>${f.to}`} className="flow-label" x={mid[0]} y={mid[1] + 4} textAnchor="middle">
          {mw(f.value)}
        </text>
      ))}
      <text className="flow-label" x={(firstDrop + BUS_X) / 2} y={BUS_Y - 10} textAnchor="middle">
        Consommation interne : {mw(recirculated)}
      </text>

      {Object.entries(POSITIONS).map(([id, [x, y]]) => {
        const t = texts[id];
        return (
          <g key={id} transform={`translate(${x},${y})`}>
            <rect className={t.tone === 'negative' ? 'node negative' : 'node'} width={NODE_W} height={NODE_H} rx={8} />
            <text className="node-title" x={NODE_W / 2} y={17} textAnchor="middle">{t.title}</text>
            <text className="node-value" x={NODE_W / 2} y={37} textAnchor="middle">{t.value}</text>
            {t.sub && <text className="node-sub" x={NODE_W / 2} y={53} textAnchor="middle">{t.sub}</text>}
          </g>
        );
      })}

      <g transform={`translate(16,${H - 14})`}>
        {LEGEND.map((item, i) => (
          <g key={item.kind} transform={`translate(${i * 210},0)`}>
            <rect y={-9} width={22} height={8} rx={2} fill={FLOW_COLORS[item.kind]} />
            <text className="node-sub" x={30} y={0}>{item.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
