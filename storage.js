import {baseMachines,materials} from './data.js';
import {positive,validateRange} from './engine.js';
export const STORAGE_KEY='rezim-workshop-v1';
export function freshState(){return {version:1,machines:structuredClone(baseMachines),materials:structuredClone(materials),tools:[],rules:[],saved:[],history:[]};}
const str=(v,n=10000)=>typeof v==='string' && v.length<=n;
const numberList=v=>Array.isArray(v)&&v.length<=500&&v.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0);
function assert(ok,msg){if(!ok)throw new Error(`Некорректный файл данных: ${msg}.`);}
// Обновляем только пустые заводские профили старой версии. Свои данные не заменяем.
export function upgradeState(original){
 const s=structuredClone(original);
 if(s?.version!==1 || !Array.isArray(s.machines))return s;
 for(const m of s.machines){
  if(m.id==='6t80shs'){m.id='6t80';if(m.name==='6Т80ШС')m.name='6Т80';}
  const base=baseMachines.find(b=>b.id===m.id);
  if(!base || m.referenceVersion===2)continue;
  const empty=['rpm','feeds','crossFeeds','threadPitches'].every(k=>Array.isArray(m[k])&&m[k].length===0)&&['minRPM','maxRPM','power','source'].every(k=>m[k]===''||m[k]==null)&&m.verified===false;
  if(empty)Object.assign(m,structuredClone(base));
  else m.referenceVersion=2;
 }
 return s;
}
export function validateState(s){
 s=upgradeState(s);
 assert(s && s.version===1,'версия');
 for(const k of ['machines','materials','tools','rules','saved','history'])assert(Array.isArray(s[k])&&s[k].length<=1000,k);
 assert(s.machines.length===2,'число профилей');
 for(const base of baseMachines){const m=s.machines.find(m=>m.id===base.id);assert(m&&m.kind===base.kind&&str(m.name,100),'профиль');for(const k of ['rpm','feeds','crossFeeds','threadPitches'])assert(numberList(m[k]),`ступени ${k}`);for(const k of ['power','minRPM','maxRPM'])if(m[k]!=='' && m[k]!=null)positive(m[k],k);assert(str(m.notes)&&str(m.source)&&typeof m.verified==='boolean','описание профиля');if(m.verified)assert(m.source.trim(),'источник профиля');if(m.minRPM&&m.maxRPM)assert(Number(m.minRPM)<=Number(m.maxRPM),'границы оборотов');}
 for(const m of s.machines){if(m.transmission)assert(Array.isArray(m.transmission)&&m.transmission.length<=30&&m.transmission.every(t=>str(t)),'передачи');for(const k of ['reverseRPM','verticalFeeds'])if(k in m)assert(numberList(m[k]),k);if(m.feedBands){assert(Array.isArray(m.feedBands)&&m.feedBands.length<=50,'диапазоны подач');for(const b of m.feedBands)assert(numberList(b.feeds)&&Number.isFinite(b.min)&&Number.isFinite(b.max)&&b.min>0&&b.max>=b.min&&[1,2,8,32].includes(b.multiplier),'диапазон подачи');}}
 for(const arr of [s.materials,s.tools,s.rules,s.saved,s.history]){const ids=new Set();for(const x of arr){assert(x&&str(x.id,100)&&!ids.has(x.id),'идентификатор');ids.add(x.id);}}
 for(const m of s.materials)assert(str(m.name,200)&&str(m.notes)&&str(m.hardness,200)&&str(m.source)&&str(m.group,50),'материал');
 for(const t of s.tools){assert(str(t.name,200)&&['hss','carbide','insert'].includes(t.toolMaterial)&&['turning','milling'].includes(t.kind)&&str(t.notes)&&str(t.source),'инструмент');if(t.maxRPM)positive(t.maxRPM,'Предел инструмента');assert(t.geometry&&typeof t.geometry==='object','геометрия');for(const v of Object.values(t.geometry))assert(str(v,100),'значение геометрии');}
 for(const r of s.rules){assert(['turning','milling'].includes(r.kind)&&str(r.material)&&str(r.toolMaterial)&&str(r.operation)&&str(r.finish)&&str(r.toolType)&&str(r.source)&&r.source.trim()&&str(r.conditions)&&r.conditions.trim(),'рекомендация');for(const k of ['vc','feed','depth']){assert(Array.isArray(r[k])&&r[k].length===2,'диапазон');validateRange(...r[k],k);}}
 for(const x of [...s.saved,...s.history]){
  assert(str(x.name,200)&&str(x.date,100)&&Number.isFinite(Date.parse(x.date))&&x.input&&['turning','milling'].includes(x.input.kind)&&x.result&&str(x.machineName,100)&&str(x.machineSource)&&typeof x.machineVerified==='boolean','запись расчёта');
  const r=x.result;assert(r.kind===x.input.kind&&typeof r.provisional==='boolean'&&str(r.source),'результат');
  for(const k of ['theoreticalRPM','rpm','vc','feedRev','feedMinute','targetFeedMinute','depth'])assert(typeof r[k]==='number'&&Number.isFinite(r[k])&&r[k]>0,`результат ${k}`);
  assert(r.kind==='turning'?r.feedTooth===null:typeof r.feedTooth==='number'&&Number.isFinite(r.feedTooth)&&r.feedTooth>0,'подача на зуб');
  assert(Array.isArray(r.warnings)&&r.warnings.length<=100&&r.warnings.every(w=>str(w)),'предупреждения');
  for(const k of ['diameter','depth','feed'])positive(x.input[k],k);
  if(x.input.speedMode==='step')positive(x.input.manualRPM,'Выбранные обороты');else positive(x.input.vc,'Скорость');
  for(const k of ['operation','material','toolMaterial','finish','toolType'])assert(str(x.input[k],200),`параметр ${k}`);
  if(x.input.kind==='milling'){positive(x.input.width,'Ширина');assert(Number.isInteger(positive(x.input.teeth,'Зубья')),'зубья');}
  for(const k of ['recommendationSource','recommendationConditions'])assert(str(x[k]),k);
 }
 assert(JSON.stringify(s).length<4000000,'размер');return s;
}
export function loadState(){const text=localStorage.getItem(STORAGE_KEY);return text?validateState(JSON.parse(text)):freshState();}
