let current=[];

export function setSecondChanceRuntime(rows=[]){
  current=(Array.isArray(rows)?rows:[]).slice(0,8).map(x=>structuredClone(x));
}

export function getSecondChanceRuntime(){
  return current.map(x=>structuredClone(x));
}

export function clearSecondChanceRuntime(){current=[]}
