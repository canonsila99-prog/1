/** Все размеры в мм, n в об/мин, Vc в м/мин. Не содержит эмпирических таблиц. */
export class CalculationError extends Error {}
export function positive(value, label, zero = false) {
  const n = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || (zero ? n < 0 : n <= 0))
    throw new CalculationError(`${label}: введите ${zero ? 'неотрицательное' : 'положительное'} число.`);
  return n;
}
export function parseSteps(text) {
  if (!text.trim()) return [];
  // Десятичная запятая допустима; разделители — пробел, новая строка и точка с запятой.
  return [...new Set(text.trim().split(/[\s;]+/).map(v => positive(v, 'Ступень')))].sort((a,b)=>a-b);
}
export function theoreticalRPM(vc, diameter) {
  return 1000 * positive(vc, 'Скорость резания') / (Math.PI * positive(diameter, 'Диаметр'));
}
export function cuttingSpeed(rpm, diameter) {
  return Math.PI * positive(diameter, 'Диаметр') * positive(rpm, 'Обороты') / 1000;
}
function upperLimit(value, label) { return value === '' || value == null ? Infinity : positive(value, label); }
function lowerLimit(value, label) { return value === '' || value == null ? 0 : positive(value, label); }
export function selectStep(target, steps, min = 0, max = Infinity) {
  positive(target, 'Целевое значение');
  if (min > max) throw new CalculationError('Минимум станка превышает максимум.');
  const valid = steps.map(v=>positive(v,'Ступень')).filter(v=>v >= min && v <= max && v <= target * (1 + 1e-12));
  if (!valid.length) throw new CalculationError('Нет доступной ступени без превышения целевого значения и ограничений. Уменьшите диаметр, пересмотрите подтверждённый режим или используйте другой станок.');
  return Math.max(...valid);
}
export function calculate(input, machine) {
  const kind = input.kind;
  if (!['turning','milling'].includes(kind) || machine.kind !== kind) throw new CalculationError('Неверный профиль станка.');
  const allowedOperations=kind==='turning'?['turning','facing','boring','groove','parting','thread']:['end','face','disc','keyway','indexable'];
  if(!allowedOperations.includes(input.operation))throw new CalculationError('Неизвестная операция обработки.');
  const d = positive(input.diameter, 'Диаметр');
  const direct = input.speedMode==='step';
  const vc = direct ? cuttingSpeed(positive(input.manualRPM,'Выбранные обороты'),d) : positive(input.vc, 'Скорость резания');
  const ap = positive(input.depth, 'Глубина резания');
  const theoretical = theoreticalRPM(vc, d);
  const min = lowerLimit(machine.minRPM, 'Минимальные обороты');
  const max = Math.min(upperLimit(machine.maxRPM, 'Максимальные обороты'), upperLimit(input.toolMaxRPM, 'Предел инструмента'));
  if (min > max) throw new CalculationError('Минимальные обороты станка выше допустимого максимума.');
  const warnings = [];
  const expectedType={turning:'external',facing:'face',boring:'boring',groove:'groove',parting:'parting',thread:'thread'};
  if(kind==='turning' && input.toolType && input.toolType!==expectedType[input.operation]) warnings.push('Тип выбранного резца отличается от обычного для этой операции. Проверьте применимость и положение кромки.');
  if(kind==='milling' && input.operation==='indexable' && input.toolMaterial!=='insert') warnings.push('Для фрезы со сменными пластинами выбран другой материал инструмента. Уточните марку режущей части и используемый диапазон режимов.');
  let rpm;
  if (input.manualRPM !== '' && input.manualRPM != null) {
    rpm = positive(input.manualRPM, 'Ручные обороты');
    if (rpm < min || rpm > max || (!direct && rpm > theoretical*(1+1e-12))) throw new CalculationError('Выбранные обороты превышают заданную скорость резания или выходят за ограничения станка/инструмента.');
    if (machine.rpm.length && !machine.rpm.includes(rpm)) throw new CalculationError('Ручные обороты должны совпадать с механической ступенью станка.');
  } else {
    if (!machine.rpm.length) throw new CalculationError('Заполните ступени оборотов в профиле станка либо укажите проверенные фактические обороты вручную.');
    rpm = selectStep(theoretical, machine.rpm, min, max);
  }
  if (!machine.rpm.length) warnings.push('Ступени коробки не заполнены: ручные обороты необходимо сверить с табличкой станка.');
  if (!machine.minRPM || !machine.maxRPM) warnings.push('Границы оборотов станка не подтверждены.');
  if (!input.toolMaxRPM) warnings.push('Предел оборотов инструмента не задан: проверьте паспорт и закрепление.');
  let feedMinute, feedRev, feedTooth = null, targetFeedMinute, source;
  const thread = kind==='turning' && input.operation==='thread';
  if (kind==='milling') {
    const teeth = positive(input.teeth, 'Количество зубьев');
    if (!Number.isInteger(teeth)) throw new CalculationError('Количество зубьев должно быть целым.');
    const width = positive(input.width, 'Ширина фрезерования');
    if (width > d) throw new CalculationError('Ширина фрезерования не может превышать диаметр фрезы.');
    feedTooth = positive(input.feed,'Подача на зуб');
    targetFeedMinute = feedTooth * teeth * rpm;
    const feedSteps=input.feedAxis==='vertical' ? (machine.verticalFeeds||[]) : machine.feeds;
    if (feedSteps.length) {
      feedMinute = selectStep(targetFeedMinute, feedSteps);
      if(machine.referenceVersion===2 && machine.id==='6t80' && input.feedAxis!=='vertical' && feedMinute===325)warnings.push('Ступень 325 мм/мин перенесена из отраслевого каталога. Возможна опечатка вместо 315: перед применением сверьте табличку своего станка.');
      source = 'Механическая минутная подача';
    } else {
      feedMinute = targetFeedMinute;
      source = 'Целевая подача; ступень не подтверждена';
      warnings.push('Заполните механические минутные подачи 6Т80. Пока показана целевая подача; при ручном перемещении выдержать её точно нельзя.');
    }
    feedTooth = feedMinute / (teeth * rpm);
    feedRev = feedMinute / rpm;
    if (ap > d) warnings.push('Глубина больше диаметра: проверьте длину режущей части и разрешённый способ фрезерования.');
    warnings.push('Расчёт для бокового/торцевого резания; осевое врезание, малое радиальное зацепление и дисковые фрезы требуют рекомендаций производителя.');
  } else {
    const target = positive(input.feed, thread ? 'Шаг резьбы' : 'Подача на оборот');
    const cross = ['facing','groove','parting'].includes(input.operation);
    const bands=machine.feedBands?.filter(b=>rpm>=b.min&&rpm<=b.max)||[];
    const steps = thread ? (machine.threadPitches || []) : machine.feedBands ? [...new Set(bands.flatMap(b=>b.feeds.map(f=>cross?f/2:f)))] : cross ? machine.crossFeeds : machine.feeds;
    if (thread) {
      if (steps.length && !steps.includes(target)) throw new CalculationError('Указанный шаг резьбы отсутствует в подтверждённом списке коробки.');
      feedRev = target;
      source = 'Синхронная подача ходовым винтом';
      if (!steps.length) warnings.push('Список шагов резьбы не заполнен: подтвердите настройку коробки. Формула ниже — для однозаходной метрической резьбы.');
      warnings.push('Для резьбы глубина — радиальное врезание за проход, а не полная высота профиля. Число проходов и выход инструмента здесь не рассчитываются.');
    } else if (steps.length) {
      feedRev = selectStep(target, steps);
      source = cross ? 'Механическая поперечная подача' : 'Механическая продольная подача';
      if(bands.length){const band=bands.find(b=>b.feeds.includes(cross?feedRev*2:feedRev));source+=` · множитель шага ×${band.multiplier}`;if(band.multiplier!==1)warnings.push(`Для выбранной подачи настройте звено увеличения шага ×${band.multiplier}; диапазон шпинделя ${band.min}–${band.max} об/мин. Сверьте рукоятки по таблице станка.`);}
    } else {
      feedRev = target;
      source = 'Целевая подача; ступень не подтверждена';
      warnings.push(`Список ${cross ? 'поперечных' : 'продольных'} подач не заполнен: фактическую подачу нужно подтвердить по станку.`);
    }
    feedMinute = feedRev * rpm;
    targetFeedMinute = target * rpm;
    if (['turning','boring','thread'].includes(input.operation) && 2*ap >= d) throw new CalculationError('Радиальная глубина должна быть меньше половины диаметра.');
    if (['facing','parting'].includes(input.operation)) warnings.push('При постоянных оборотах скорость уменьшается к центру. Диаметр в расчёте — максимальный диаметр резания.');
    if (['groove','parting'].includes(input.operation)) warnings.push('Для канавки/отрезки глубина — радиальное перемещение; ширина пластины, вылет и подвод СОЖ проверяются отдельно.');
  }
  warnings.push('Мощность и устойчивость резания не проверены: нет данных об удельной силе резания, КПД и состоянии станка. Проверяйте нагрузку при пробном проходе.');
  for(const value of [theoretical,rpm,feedRev,feedMinute,targetFeedMinute,cuttingSpeed(rpm,d)])if(!Number.isFinite(value)||value<=0)throw new CalculationError('Параметры приводят к недопустимому числовому результату. Проверьте порядок величин и единицы.');
  return {kind, theoreticalRPM:theoretical, rpm, vc:cuttingSpeed(rpm,d), feedRev, feedMinute, feedTooth,
    targetFeedMinute, depth:ap, source, warnings,
    provisional: (machine.id==='6t80' && machine.referenceVersion===2 && input.feedAxis!=='vertical' && feedMinute===325) || !machine.rpm.length || (kind==='milling' ? !(input.feedAxis==='vertical' ? machine.verticalFeeds?.length : machine.feeds.length) : thread ? !machine.threadPitches?.length : ['facing','groove','parting'].includes(input.operation) ? !machine.crossFeeds.length : !machine.feeds.length)};
}
export function findRecommendation(rules, input) {
  return rules.find(r=> r.kind===input.kind && r.material===input.material && r.toolMaterial===input.toolMaterial && r.operation===input.operation && r.finish===input.finish && r.toolType===input.toolType);
}
export function validateRange(min, max, label) {
  const a=positive(min,label), b=positive(max,label);
  if (a>b) throw new CalculationError(`${label}: нижняя граница больше верхней.`);
  return [a,b];
}
