/* Generate has two retained editors; only the visible editor supplies a request. */
(() => {
  const $ = id => document.getElementById(id);
  const catalogue = window.V3_V1_CATALOGUE;
  const dimensions = window.V3Dimensions;
  const sizes = dimensions.V3_MAP_SIZES.map(({id,label}) => [id,label]);
  const geometry = dimensions.V3_MAP_GEOMETRIES.map(({id,label}) => [id,label]);
  const experimental = new Set([...dimensions.V3_MAP_SIZES, ...dimensions.V3_MAP_GEOMETRIES].filter(item=>item.experimental).map(item=>item.id));
  const pairs = text => text.split(';').map(item => { const [value, label] = item.split('|'); return [value, label || value]; });
  const select = (key, label, choices, fallback) => ({ key, label, choices: typeof choices === 'string' ? pairs(choices) : choices, fallback, type: 'select' });
  const number = (key, label, min, max, fallback) => ({ key, label, min, max, fallback, type: 'number' });
  const check = (key, label, fallback) => ({ key, label, fallback, type: 'checkbox' });
  const standard = [
    select('players', 'Players', '2;3;4;6;8', '4'),
    select('size', 'Size', sizes, 'STANDARD'),
    select('geometry', 'Geometry', geometry, 'STANDARD'),
    select('mobility', 'Mobility', 'VERY_SLOW|Very slow;SLOW|Slow;MODERATE|Moderate;FAST|Fast;VERY_FAST|Very fast', 'MODERATE'),
    select('isolation', 'Isolation', 'OPEN|Open;LOW|Low;MODERATE|Moderate;HIGH|High;EXTREME|Extreme', 'MODERATE'),
    select('water', 'Water', 'MINIMAL|Minimal;LOW|Low;MODERATE|Moderate;HIGH|High;OCEANIC|Vast oceans', 'MODERATE'),
    select('mountains', 'Mountains', 'NONE|None;FEW|Few;MODERATE|Moderate;MANY|Many;EXTREME|Extreme', 'MODERATE'),
    select('challenge', 'Challenge', 'GENTLE|Gentle;MODERATE|Moderate;DEMANDING|Demanding;HARSH|Harsh', 'MODERATE'),
    select('regionalVariety', 'Regional variety', 'UNIFORM|Uniform;SUBTLE|Subtle;VARIED|Varied;DRAMATIC|Dramatic', 'VARIED'),
    select('competition', 'Competition', 'LOW|Low;MODERATE|Moderate;HIGH|High;INTENSE|Intense', 'MODERATE'),
    select('climate', 'Climate', 'COLD|Cold;COOL|Cool;TEMPERATE|Temperate;WARM|Warm;HOT|Hot', 'TEMPERATE'),
  ];
  const abundance = 'SCARCE|Scarce;STANDARD|Standard;ABUNDANT|Abundant';
  const groups = [
    ['World', [
      select('engine', 'Engine', 'EXCOGITARE|Excogitare;ECCENTRIC|Eccentric;PHYSICAL|Physical;POLIS|Polis'),
      select('preset', 'Map type', catalogue.presets.map(p => [p.id, p.label])),
      select('style', 'World character', 'REALISTIC|Realistic;FANTASTICAL|Fantastical;MUNDANE|Mundane;BRUTAL|Brutal'),
      select('scale', 'Scale', 'GLOBAL|Global;CONTINENTAL|Continental;REGIONAL|Regional;PROVINCIAL|Provincial;LOCAL|Local', 'GLOBAL'),
      select('modifier', 'World modifier', 'NONE|None;STRATEGIC_DEPTH|Strategic Depth;FRACTURED|Fractured World;DOOMSDAY|Doomsday'),
    ]],
    ['Shape', [
      select('size', 'Map size', sizes),
      select('geometry', 'Geometry', geometry),
      select('wrapType', 'Wrapping', 'PRESET|Map default;EAST_WEST|East–west;NONE|None'),
      select('projectionType', 'Pole orientation', 'NORTH_SOUTH|North / south;POLAR_CENTERED|Polar centered;EQUATORIAL_POLE|Equatorial pole'),
      number('waterPercent', 'Water %', 0, 90, 55), number('mountainPercent', 'Mountains % of land', 0, 38, 16),
      select('worldAge', 'World age', 'YOUNG|Young;NORMAL|Normal;OLD|Old'),
    ]],
    ['Climate & terrain', [
      select('climate', 'Climate', 'COOL|Cool;TEMPERATE|Temperate;HOT|Hot'),
      select('rainfall', 'Rainfall', 'ARID|Arid;NORMAL|Normal;WET|Wet'),
      select('riverDensity', 'River density', 'SPARSE|Sparse;NORMAL|Normal;DENSE|Dense'),
      select('archetype', 'Archetype', [['NARRATIVE_DEFAULT','Narrative default'], ['EXISTING','Existing'], ...catalogue.archetypes.map(a => [a.id,a.label])], 'NARRATIVE_DEFAULT'),
      select('archetypeIntensity', 'Archetype intensity', 'HINT|Hint;STRONG|Strong;TRANSFORMATIVE|Transformative', 'STRONG'),
    ]],
    ['Resources', [
      select('bonusAbundance', 'Bonus resources', abundance), select('luxuryAbundance', 'Luxuries', abundance), select('strategicAbundance', 'Strategic resources', abundance),
      select('strategicDistribution', 'Strategic distribution', 'EVEN|Even;REGIONAL|Regional;CLUSTERED|Clustered'),
      number('offshoreOilPercent', 'Offshore oil %', 0, 100, 25),
      check('luxuryRegional', 'Regional luxuries', false), check('luxuryStartGuarantee', 'Luxury near starts', true), check('strategicStartGuarantee', 'Strategics near starts', true),
    ]],
    ['Players & starts', [
      number('players', 'Players', 2, 22, 8), number('cityStates', 'City states', 0, 41, 8),
      select('balance', 'Balance', 'STANDARD|Standard;TOURNAMENT|Tournament;TEAMS|Teams'),
      select('startQuality', 'Start quality', 'STANDARD|Standard;BALANCED|Balanced strategic access;LEGENDARY|Legendary'),
      select('teamSize', 'Team size', '2|2 players;3|3 players;4|4 players'),
      select('teamLayout', 'Team geography', 'CLUSTERED|Clustered;FRONTLINES|Opposing fronts;DISTRIBUTED|Distributed'),
      number('cityStateMinSpacing', 'City-state spacing', 5, 12, 5),
      select('cityStateDistribution', 'City-state distribution', 'EVEN|Even;REGIONAL|Regional'),
      select('cityStateCoastalPreference', 'City-state coast', 'ANY|Any;PREFER|Prefer;REQUIRE|Require'),
    ]],
    ['Wonders & sites', [
      number('wonderCount', 'Natural wonders', 0, 12, 5), number('wonderMinSpacing', 'Wonder spacing', 3, 20, 8), number('wonderStartBuffer', 'Wonder start buffer', 0, 15, 5),
      select('barbarianAbundance', 'Barbarians', 'NONE|None;SCARCE|Scarce;STANDARD|Standard;RAGING|Raging'),
      number('barbarianStartDistance', 'Camp start distance', 2, 15, 5),
      select('ruinAbundance', 'Ancient ruins', 'NONE|None;SCARCE|Scarce;STANDARD|Standard;RAGING|Abundant'),
      number('ruinStartDistance', 'Ruin start distance', 1, 12, 3),
    ]],
    ['Seed & effort', [
      { key: 'seed', label: 'Seed', type: 'text', fallback: 'excogitare' },
      select('effort', 'Generation effort', 'STANDARD|Standard;THOROUGH|Thorough;EXHAUSTIVE|Exhaustive', 'STANDARD'),
    ]],
  ];
  const engineFields = {
    EXCOGITARE: [],
    ECCENTRIC: [
      select('fantasticality', 'Fantasticality', 'RESTRAINED|Restrained;MYTHIC|Mythic;UNBOUND|Unbound'),
      select('granularity', 'Geographic granularity', 'LOW|Low;FAIR|Fair;HIGH|High;VERY_HIGH|Very high'),
      number('oceanBasins', 'Ocean basins', 1, 5, 2),
      select('regionClimateLogic', 'Climate logic', 'LAWLESS|Lawless;INFLUENCED|Influenced;ORDERED|Ordered'),
      select('regionContrast', 'Region contrast', 'BLENDED|Blended;VARIED|Varied;EXTREME|Extreme'),
      select('eccentricExtreme', 'World extreme', 'NONE|None;SNOWBALL|Snowball;JURASSIC|Jurassic;ARRAKIS|Arrakis;ARBOREA|Arborea'),
      number('coastalRangePercent', 'Coastal ranges %', 0, 100, 45), check('landAtPoles', 'Land at poles', true),
    ],
    PHYSICAL: [
      select('plateActivity', 'Plate activity', 'QUIET|Quiet;NORMAL|Normal;VIOLENT|Violent'),
      select('erosionStrength', 'Erosion', 'LIGHT|Light;MODERATE|Moderate;STRONG|Strong'),
      select('physicalRotation', 'Rotation', 'PROGRADE|Prograde;RETROGRADE|Retrograde'),
      select('physicalSeasonality', 'Seasonality', 'MILD|Mild;EARTHLIKE|Earth-like;EXTREME|Extreme'),
      select('physicalOceanInfluence', 'Ocean influence', 'WEAK|Weak;NORMAL|Normal;STRONG|Strong'),
    ],
    POLIS: [
      select('polisConflictPattern', 'Conflict pattern', 'RADIAL|Radial;OPPOSING_FRONTS|Opposing fronts;CROSSROADS|Crossroads;RIVAL_CONTINENTS|Rival continents'),
      select('polisSymmetry', 'Symmetry', 'EQUIVALENT|Equivalent;MIRRORED|Mirrored;ROTATIONAL|Rotational;ASYMMETRIC|Asymmetric'),
      select('polisExpansionPressure', 'Expansion pressure', 'RELAXED|Relaxed;STANDARD|Standard;IMMEDIATE|Immediate'),
      select('polisNavalImportance', 'Naval importance', 'LOW|Low;BALANCED|Balanced;HIGH|High'),
      number('polisChokepointDensity', 'Chokepoints %', 0, 100, 45), number('polisContestedResourcePercent', 'Contested resources %', 0, 80, 35), number('polisSafeRadius', 'Safe radius', 2, 8, 4),
    ],
  };
  const advanced = {};
  const presetByEngine = {};
  const automaticValue = '__AUTO__';
  function addOptions(input,choices,key){
    if(key!=='size'&&key!=='geometry'){input.append(...choices.map(([v,l])=>option(v,l)));return;}
    input.append(...choices.filter(([v])=>!experimental.has(v)).map(([v,l])=>option(v,l)));
    const group=document.createElement('optgroup');group.label='Experimental';
    group.append(...choices.filter(([v])=>experimental.has(v)).map(([v,l])=>option(v,l)));input.append(group);
  }
  function option(value,label){const node=document.createElement('option');node.value=value;node.textContent=label;return node;}
  function activeOverrides(){const allowed=new Set([...groups.flatMap(([,fields])=>fields.map(def=>def.key)),...(engineFields[advanced.engine]||[]).map(def=>def.key)]);return Object.fromEntries(Object.entries(advanced).filter(([key])=>allowed.has(key)));}
  function updateStatus(){
    const active=activeOverrides(),count=Object.keys(active).length;
    $('advanced-status').textContent=`${count} saved`;$('advanced-status').hidden=count===0;$('reset-advanced').disabled=Object.keys(advanced).length===0;
    document.dispatchEvent(new Event('v3:controls-change'));

  }
  function field(def,isStandard=false){
    const label=document.createElement('label'),text=document.createElement('span');text.textContent=def.label;label.append(text);
    const input=document.createElement(def.type==='select'||def.type==='checkbox'?'select':'input');input.id=`${isStandard?'standard':'advanced'}-${def.key}`;input.dataset.setting=def.key;input.setAttribute('aria-label',def.label);
    if(isStandard){addOptions(input,def.choices,def.key);input.value=def.fallback;label.append(input);return label;}
    if(def.type==='select'||def.type==='checkbox'){
      const choices=def.type==='checkbox'?[['true','Enabled'],['false','Disabled']]:def.choices;
      input.append(option(automaticValue,'Automatic'));addOptions(input,choices,def.key);
      input.value=Object.hasOwn(advanced,def.key)?String(advanced[def.key]):automaticValue;
    }else{input.type=def.type;input.placeholder=def.type==='text'?'Random':'Auto';input.value=Object.hasOwn(advanced,def.key)?String(advanced[def.key]):'';if(def.type==='number'){input.min=def.min;input.max=def.max;input.step='1';}else input.maxLength=80;}
    input.onchange=()=>{
      if(input.value===automaticValue||input.value==='')delete advanced[def.key];
      else if(def.type==='number'){const n=Number(input.value);if(!Number.isFinite(n)){input.value='';delete advanced[def.key];}else{advanced[def.key]=Math.max(def.min,Math.min(def.max,n));input.value=String(advanced[def.key]);}}
      else advanced[def.key]=def.type==='checkbox'?input.value==='true':input.value;
      if(def.key==='engine'){
        if(advanced.engine&&presetByEngine[advanced.engine])advanced.preset=presetByEngine[advanced.engine];else delete advanced.preset;
        updateMapTypes();renderEngineFields();
      }else if(def.key==='preset'&&advanced.preset){const preset=catalogue.presets.find(p=>p.id===advanced.preset);advanced.engine=preset.engine;presetByEngine[preset.engine]=preset.id;$('advanced-engine').value=preset.engine;updateMapTypes();renderEngineFields();}
      updateStatus();
    };
    label.append(input);return label;
  }
  function group(title,fields,open=false){const details=document.createElement('details');details.className='legacy-group';details.name='v3-legacy-options';details.open=open;const summary=document.createElement('summary');summary.textContent=title;const mark=document.createElement('span');mark.className='disclosure-mark';mark.textContent='⌄';mark.setAttribute('aria-hidden','true');summary.append(mark);const body=document.createElement('div');body.className='legacy-fields';body.append(...fields.map(def=>field(def)));details.append(summary,body);return details;}
  function updateMapTypes(){const input=$('advanced-preset');input.replaceChildren(option(automaticValue,'Automatic'));for(const engine of ['EXCOGITARE','ECCENTRIC','PHYSICAL','POLIS']){if(advanced.engine&&engine!==advanced.engine)continue;const group=document.createElement('optgroup');group.label={EXCOGITARE:'Excogitare',ECCENTRIC:'Eccentric',PHYSICAL:'Physical',POLIS:'Polis'}[engine];group.append(...catalogue.presets.filter(p=>p.engine===engine).map(p=>option(p.id,p.label)));input.append(group);}input.value=advanced.preset||automaticValue;}
  const engineGroup=document.createElement('details');engineGroup.id='legacy-engine-group';engineGroup.className='legacy-group';engineGroup.name='v3-legacy-options';
  function renderEngineFields(){const fields=engineFields[advanced.engine]||[];engineGroup.hidden=!fields.length;const summary=document.createElement('summary');summary.textContent=`${{ECCENTRIC:'Eccentric',PHYSICAL:'Physical',POLIS:'Polis'}[advanced.engine]||'Engine'} settings`;const mark=document.createElement('span');mark.className='disclosure-mark';mark.textContent='⌄';mark.setAttribute('aria-hidden','true');summary.append(mark);const body=document.createElement('div');body.className='legacy-fields';body.append(...fields.map(def=>field(def)));engineGroup.replaceChildren(summary,body);}
  $('standard-generation').append(...standard.map(def=>field(def,true)));
  const root=$('advanced-generation');
  groups.forEach(([title,fields],i)=>{root.append(group(title,fields,i===0));if(i===0)root.append(engineGroup);});
  updateMapTypes();renderEngineFields();updateStatus();
  $('reset-advanced').onclick=()=>{for(const key of Object.keys(advanced))delete advanced[key];for(const key of Object.keys(presetByEngine))delete presetByEngine[key];for(const input of root.querySelectorAll('select,input'))input.value=input.tagName==='SELECT'?automaticValue:'';updateMapTypes();renderEngineFields();updateStatus();};
  function syncEditor(){const expanded=$('advanced-options').open;$('standard-generation').hidden=expanded;$('standard-generation').inert=expanded;$('standard-generation').setAttribute('aria-hidden',String(expanded));document.dispatchEvent(new Event('v3:controls-change'));const scroll=$('generate-panel').closest('.panel-scroll');if(scroll)scroll.scrollTop=0;}
  $('advanced-options').addEventListener('toggle',syncEditor);
  function read(){
    if(!$('advanced-options').open){const parameters=Object.fromEntries(standard.map(def=>[def.key,$(`standard-${def.key}`).value]));parameters.players=Number(parameters.players);return {mode:'STANDARD',parameters};}
    // Commit numeric/text fields from their visible values before snapshotting.
    // This also covers Enter submission and assistive input that has not blurred.
    for(const input of root.querySelectorAll('input'))input.dispatchEvent(new Event('change',{bubbles:true}));
    const options=activeOverrides(),recipe={};for(const key of ['scale','archetype','archetypeIntensity','effort'])if(Object.hasOwn(options,key)){recipe[key]=options[key];delete options[key];}if(Object.hasOwn(options,'teamSize'))options.teamSize=Number(options.teamSize);return {mode:'ADVANCED',options,recipe,catalogueSource:catalogue.source};
  }

  function applyStandard(parameters){
    if(!standard.every(def=>def.choices.some(([value])=>String(value)===String(parameters[def.key]))))throw new Error('The generated settings cannot be displayed.');
    for(const def of standard)$(`standard-${def.key}`).value=String(parameters[def.key]);
    $('advanced-options').open=false;syncEditor();
  }
  window.V3GenerationControls={read,applyStandard};
})();
