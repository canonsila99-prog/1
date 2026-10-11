import {baseMachines,materials} from './data.js';
import {positive,validateRange} from './engine.js';
export const STORAGE_KEY='rezim-workshop-v1';
export function freshState(){return {version:1,machines:structuredClone(baseMachines),materials:structuredClone(materials),tools:[],rules:[],saved:[],history:[]};}
const str=(v,n=10000)=>typeof v==='string' && v.length<=n;
const numberList=v=>Array.isArray(v)&&v.length<=500&&v.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0);
function assert(ok,msg){if(!ok)throw new Error(`Некорректный файл данных: ${msg}.`);}
export function validateState(s){
 assert(s && s.version===1,'версия');
 for(const k of ['machines','materials','tools','rules','saved','history'])assert(Array.isArray(s[k])&&s[k].length<=1000,k);
 assert(s.machines.length===2,'число профилей');
 for(const base of baseMachines){const m=s.machines.find(m=>m.id===base.id);assert(m&&m.kind===base.kind&&str(m.name,100),'профиль');for(const k of ['rpm','feeds','crossFeeds','threadPitches'])assert(numberList(m[k]),`ступени ${k}`);for(const k of ['power','minRPM','maxRPM'])if(m[k]!=='' && m[k]!=null)positive(m[k],k);assert(str(m.notes)&&str(m.source)&&typeof m.verified==='boolean','описание профиля');if(m.verified)assert(m.source.trim(),'источник профиля');if(m.minRPM&&m.maxRPM)assert(Number(m.minRPM)<=Number(m.maxRPM),'границы оборотов');}
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
  for(const k of ['diameter','vc','depth','feed'])positive(x.input[k],k);
  for(const k of ['operation','material','toolMaterial','finish','toolType'])assert(str(x.input[k],200),`параметр ${k}`);
  if(x.input.kind==='milling'){positive(x.input.width,'Ширина');assert(Number.isInteger(positive(x.input.teeth,'Зубья')),'зубья');}
  for(const k of ['recommendationSource','recommendationConditions'])assert(str(x[k]),k);
 }
 assert(JSON.stringify(s).length<4000000,'размер');return s;
}
export function loadState(){const text=localStorage.getItem(STORAGE_KEY);return text?validateState(JSON.parse(text)):freshState();}
