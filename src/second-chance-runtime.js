import {SECOND_CHANCE_TARGET} from './second-chance-watch-utils.js';

let current=[];

export function setSecondChanceRuntime(rows=[]){
  current=(Array.isArray(rows)?rows:[]).slice(0,SECOND_CHANCE_TARGET).map(x=>structuredClone(x));
}

export function getSecondChanceRuntime(){
  return current.map(x=>structuredClone(x));
}

export function clearSecondChanceRuntime(){current=[]}
