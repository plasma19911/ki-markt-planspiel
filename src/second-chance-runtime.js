import {SECOND_CHANCE_TARGET} from './second-chance-watch-utils.js';

let current=[];
const LIVE_RECHECK_WAVE=3;

export function setSecondChanceRuntime(rows=[]){
  current=(Array.isArray(rows)?rows:[]).slice(0,SECOND_CHANCE_TARGET).map(x=>structuredClone(x));
}

export function getSecondChanceRuntime(){
  // Der Watch-Pool bleibt voll erhalten. Pro Minute gehen aber nur drei Werte in
  // den teuren frischen 1m-Zweitcheck; durch die laufend neu sortierte Watch-Liste
  // kommen die aktuell wichtigsten Fast-Misses zuerst dran.
  return current.slice(0,LIVE_RECHECK_WAVE).map(x=>structuredClone(x));
}

export function clearSecondChanceRuntime(){current=[]}
