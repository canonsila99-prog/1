import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate, theoreticalRPM, cuttingSpeed, selectStep, parseSteps,findRecommendation,validateRange} from '../engine.js';
import {freshState,validateState,upgradeState} from '../storage.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`);
// Только синтетические профили для проверки арифметики; НЕ паспорта станков.
const lathe={kind:'turning',rpm:[100,250,450,630,800],feeds:[.1,.2,.3],crossFeeds:[.05,.1],threadPitches:[1,1.5],minRPM:100,maxRPM:800};
const mill={kind:'milling',rpm:[100,250,450,630],feeds:[40,63,80,100],minRPM:100,maxRPM:630};
const turning={kind:'turning',operation:'turning',diameter:50,vc:100,depth:2,feed:.2,manualRPM:'',toolMaxRPM:1000};
const milling={kind:'milling',operation:'end',diameter:20,vc:30,depth:2,width:10,teeth:4,feed:.05,manualRPM:'',toolMaxRPM:1000};
test('Формула оборотов и обратный пересчёт скорости',()=>{close(theoreticalRPM(100,50),636.6197723675814);close(cuttingSpeed(theoreticalRPM(100,50),50),100);});
test('Точение: ступень 630, скорость и минутная подача',()=>{const r=calculate(turning,lathe);assert.equal(r.rpm,630);close(r.vc,98.96016858807849);close(r.feedMinute,126);assert.equal(r.depth,2);});
test('Фрезерование: подбор оборотов и подачи, фактическая fz',()=>{const r=calculate(milling,mill);assert.equal(r.rpm,450);assert.equal(r.feedMinute,80);close(r.feedTooth,80/(4*450));close(r.targetFeedMinute,90);close(r.vc,28.274333882308138);});
test('Не превышать скорость: самая близкая нижняя ступень',()=>{assert.equal(selectStep(636,[800,630,450]),630);assert.equal(selectStep(630,[630,800]),630);assert.throws(()=>selectStep(90,[100,250]));});
test('Ограничения инструмента и станка имеют приоритет',()=>{assert.equal(calculate({...turning,toolMaxRPM:500},lathe).rpm,450);assert.throws(()=>calculate({...turning,toolMaxRPM:80},lathe));assert.equal(calculate(turning,{...lathe,maxRPM:500}).rpm,450);});
test('Ручная ступень не обходит ограничения',()=>{assert.throws(()=>calculate({...turning,manualRPM:800},lathe));assert.throws(()=>calculate({...turning,manualRPM:600},lathe));assert.equal(calculate({...turning,manualRPM:450},lathe).rpm,450);});
test('Поперечная подача для торца, канавки и отрезки',()=>{for(const operation of ['facing','groove','parting'])assert.equal(calculate({...turning,operation},lathe).feedRev,.1);});
test('Резьба: шаг синхронной подачи и предупреждение о проходах',()=>{const r=calculate({...turning,operation:'thread',feed:1.5},lathe);assert.equal(r.feedRev,1.5);assert.equal(r.feedMinute,945);assert.ok(r.warnings.some(w=>w.includes('проходов')));assert.throws(()=>calculate({...turning,operation:'thread',feed:1.25},lathe));});
test('Отсутствие паспортных данных не маскируется',()=>{assert.throws(()=>calculate(turning,{...lathe,rpm:[]}));const r=calculate({...turning,manualRPM:450},{...lathe,rpm:[],feeds:[]});assert.equal(r.provisional,true);assert.ok(r.warnings.some(w=>w.includes('не заполнен')));});
test('Без ступеней минутной подачи показывается целевая, не реальная',()=>{const r=calculate(milling,{...mill,feeds:[]});assert.equal(r.feedMinute,90);assert.equal(r.provisional,true);assert.ok(r.source.includes('не подтверждена'));});
test('Невозможная подача не округляется вверх',()=>{assert.throws(()=>calculate({...milling,feed:.001},mill));assert.throws(()=>calculate({...turning,feed:.01},lathe));});
test('Нулевые/отрицательные/нечисловые входные значения отвергаются',()=>{for(const key of ['diameter','vc','depth','feed'])for(const bad of [0,-1,NaN,Infinity,'abc',''])assert.throws(()=>calculate({...turning,[key]:bad},lathe));assert.throws(()=>calculate({...milling,teeth:2.5},mill));assert.throws(()=>calculate({...milling,width:21},mill));});
test('Радиальная глубина точения не уничтожает весь диаметр',()=>assert.throws(()=>calculate({...turning,depth:25},lathe)));
test('Десятичная запятая и независимые разделители ступеней',()=>{assert.deepEqual(parseSteps('0,1; 0,2\n0.1 0,05'),[.05,.1,.2]);assert.deepEqual(parseSteps(''),[]);assert.throws(()=>parseSteps('100;0'));assert.equal(calculate({...turning,feed:'0,2'},lathe).feedMinute,126);});
test('Диапазон рекомендации требует точного совпадения всех условий выбора',()=>{const rule={kind:'turning',material:'st45',toolMaterial:'hss',operation:'turning',finish:'rough',toolType:'external'};assert.equal(findRecommendation([rule],rule),rule);assert.equal(findRecommendation([rule],{...rule,toolType:'boring'}),undefined);assert.equal(findRecommendation([rule],{...rule,finish:'finish'}),undefined);assert.throws(()=>validateRange(2,1,'Vc'));});
test('Свежие данные и экспорт/импорт проходят проверку схемы',()=>{const s=freshState();assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))),s);assert.equal(s.machines[0].rpm.length,22);});
test('Повреждённые резервные копии и неверные диапазоны отвергаются',()=>{assert.throws(()=>validateState({}));const s=freshState();s.machines[0].rpm=[-1];assert.throws(()=>validateState(s));const t=freshState();t.rules=[{id:'x',kind:'turning',material:'st45',toolMaterial:'hss',operation:'turning',finish:'rough',toolType:'external',source:'',conditions:'',vc:[10,20],feed:[.1,.2],depth:[1,2]}];assert.throws(()=>validateState(t));});
test('Детерминированность: повторный расчёт не меняет профиль и результат',()=>{const before=JSON.stringify(lathe);assert.deepEqual(calculate(turning,lathe),calculate(turning,lathe));assert.equal(JSON.stringify(lathe),before);});

test('Неизвестная операция не подменяется обычным точением',()=>assert.throws(()=>calculate({...turning,operation:'unknown'},lathe)));
test('Переполнение минутной подачи не выдаётся за режим',()=>assert.throws(()=>calculate({...turning,feed:1e308},{...lathe,feeds:[]})));


test('Полные справочные ряды: 16К20 и основной шпиндель 6Т80',()=>{
 const [l,m]=freshState().machines;
 assert.deepEqual(l.rpm,[12.5,16,20,25,31.5,40,50,63,80,100,125,160,200,250,315,400,500,630,800,1000,1250,1600]);
 assert.deepEqual(m.rpm,[50,71,100,140,200,280,400,560,800,1120,1600,2240]);
 assert.equal(l.minRPM,12.5);assert.equal(l.maxRPM,1600);assert.equal(m.minRPM,50);assert.equal(m.maxRPM,2240);
 assert.equal(l.power,11);assert.equal(m.power,3);assert.equal(m.feeds.length,18);assert.equal(m.verticalFeeds.length,18);
 assert.equal(m.name,'6Т80');assert.equal(l.verified,false);
});
test('Явный выбор ступени: Vc пересчитывается, пределы остаются обязательными',()=>{
 const [l,m]=freshState().machines;
 for(const rpm of l.rpm){const r=calculate({...turning,speedMode:'step',manualRPM:rpm,vc:'',toolMaxRPM:''},l);assert.equal(r.rpm,rpm);close(r.vc,Math.PI*50*rpm/1000);}
 for(const rpm of m.rpm)assert.equal(calculate({...milling,speedMode:'step',manualRPM:rpm,vc:'',feed:1,toolMaxRPM:''},m).rpm,rpm);
 assert.throws(()=>calculate({...turning,speedMode:'step',manualRPM:1600,vc:''},l));
 assert.throws(()=>calculate({...turning,speedMode:'step',manualRPM:1500,toolMaxRPM:''},l));
 assert.throws(()=>calculate({...turning,speedMode:'step',manualRPM:''},l));
});
test('16К20: подача зависит от диапазона оборотов и множителя шага',()=>{
 const l=freshState().machines[0];const at=(rpm,feed,operation='turning')=>calculate({...turning,speedMode:'step',manualRPM:rpm,feed,operation,toolMaxRPM:''},l);
 assert.equal(at(1600,2.8).feedRev,.7);assert.equal(at(630,2.8).feedRev,1.4);assert.equal(at(160,2.8).feedRev,2.8);assert.equal(at(40,2.8).feedRev,2.8);
 assert.ok(at(630,1.4).source.includes('×2'));assert.ok(at(160,2.8).source.includes('×8'));
 assert.equal(at(630,1.4,'facing').feedRev,.7);assert.equal(at(1600,.2,'facing').feedRev,.2);
});
test('6Т80: вертикальный ряд отдельный; спорная ступень явно отмечена',()=>{
 const m=freshState().machines[1];
 const r=calculate({...milling,speedMode:'step',manualRPM:400,feed:.1,feedAxis:'vertical'},m);assert.equal(r.feedMinute,160);
 const q=calculate({...milling,speedMode:'step',manualRPM:400,feed:.21},m);assert.equal(q.feedMinute,325);assert.ok(q.warnings.some(w=>w.includes('опечатка')));
});
test('Миграция пустых старых профилей заполняет таблицы, свои сохраняет',()=>{
 const s=freshState();for(const m of s.machines){delete m.referenceVersion;delete m.feedBands;delete m.verticalFeeds;delete m.reverseRPM;for(const k of ['rpm','feeds','crossFeeds','threadPitches'])m[k]=[];for(const k of ['minRPM','maxRPM','power','source'])m[k]='';}
 s.machines[1].id='6t80shs';s.machines[1].name='6Т80ШС';
 const upgraded=validateState(s);assert.equal(upgraded.machines[1].id,'6t80');assert.equal(upgraded.machines[0].rpm.length,22);assert.equal(upgraded.machines[1].rpm.length,12);assert.equal(s.machines[0].rpm.length,0);
 s.machines[0].rpm=[100,250];s.machines[0].source='Мой паспорт';assert.deepEqual(upgradeState(s).machines[0].rpm,[100,250]);
 const cleared=freshState();cleared.machines[0].rpm=[];assert.equal(upgradeState(cleared).machines[0].rpm.length,0);
});
test('Расчёт с выбранными оборотами сохраняется без введённого Vc',()=>{
 const s=freshState();const input={...turning,vc:'',speedMode:'step',manualRPM:630,material:'st3',toolMaterial:'hss',finish:'rough',toolType:'external'};
 s.history=[{id:'direct',name:'Проверка',date:new Date().toISOString(),input,result:calculate(input,s.machines[0]),machineName:'16К20',machineSource:'Источник',machineVerified:false,recommendationSource:'',recommendationConditions:''}];
 assert.equal(validateState(s).history.length,1);
});
