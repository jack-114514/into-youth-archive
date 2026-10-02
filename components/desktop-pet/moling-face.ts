import type { Emotion } from "./settings";
import type { MolingCue } from "./moling";

export type FaceMotion = { left:number; right:number; brow:number; asymmetry:number; smile:number; mouth:number; blush:number; tears:number; hearts:number; sparkle:number };
const neutral:FaceMotion={left:.78,right:.78,brow:0,asymmetry:0,smile:.15,mouth:.15,blush:0,tears:0,hearts:0,sparkle:0};
export const faceTargets:Record<Emotion,FaceMotion>={
  normal:{...neutral},
  happy:{...neutral,left:.16,right:.16,smile:.9,mouth:.65,blush:.3},
  shy:{...neutral,left:.25,right:.25,brow:-.2,smile:.4,mouth:.3,blush:1},
  thinking:{...neutral,left:.6,right:.6,brow:.4,asymmetry:.4,smile:0,mouth:.3},
  surprised:{...neutral,left:1,right:1,brow:-.8,smile:0,mouth:1},
  sad:{...neutral,left:.5,right:.5,brow:-.65,smile:-.8,mouth:.5,tears:1},
  curious:{...neutral,left:.95,right:.8,brow:-.5,asymmetry:.6,smile:.3,mouth:.3},
  excited:{...neutral,left:1,right:1,brow:-.4,smile:1,mouth:.85,blush:.5,sparkle:1},
  confused:{...neutral,left:.55,right:.85,brow:.3,asymmetry:.8,smile:-.3,mouth:.45},
  sleepy:{...neutral,left:.12,right:.12,brow:-.1,smile:0,mouth:.4},
  angry:{...neutral,left:.6,right:.6,brow:.85,smile:-.9,mouth:.6,blush:.5},
  love:{...neutral,left:.9,right:.9,brow:-.3,smile:.8,mouth:.55,blush:.8,hearts:1},
  proud:{...neutral,left:.35,right:.35,brow:-.35,asymmetry:-.45,smile:.75,mouth:.6},
  wink:{...neutral,left:.85,right:.015,brow:-.3,asymmetry:.3,smile:.7,mouth:.6,blush:.35},
};
const poseFaces:Record<string,Emotion>={look:"curious",sleep:"sleepy",wave:"happy",jump:"excited",turn:"curious",cast:"excited",thinking:"thinking",shy:"shy",surprised:"surprised",complete:"proud"};

// Facial cues have their own lifetime; an emotion never starts a body gesture.
export class MolingFace {
  private emotion:Emotion="normal";
  private until=0;
  private lastId=-1;
  cue(cue:MolingCue,now:number){
    if(cue.randomMotion||cue.id===this.lastId)return;
    this.lastId=cue.id;
    this.emotion=poseFaces[cue.pose||""]||(cue.emotion && cue.emotion in faceTargets ? cue.emotion as Emotion : "normal");
    this.until=cue.action==="thinking"?Infinity:now+5000;
  }
  update(now:number,idle:boolean):Emotion {
    if(now<this.until)return this.emotion;
    const phase=now%20000;
    return idle && phase>12000 && phase<15000 ? "curious" : idle && phase>17000 ? "happy" : "normal";
  }
  reset(){this.until=0;this.emotion="normal";}
}

// In SVG face coordinates, always inside the black face. No body position is used or returned.
export function molingGaze(pointer:{x:number;y:number}|null,center:{x:number;y:number},strength:number){
  if(!pointer)return {x:0,y:0};
  const dx=pointer.x-center.x,dy=pointer.y-center.y,distance=Math.hypot(dx,dy),amount=Math.max(0,Math.min(1,strength));
  return {x:dx/(distance+120)*6*amount,y:dy/(distance+120)*3.5*amount};
}

// Identical cubic topology allows the open eyes and heart eyes to deform continuously.
export function faceEyePath(open:number,heart=0){
  const lower=-9+Math.max(.015,Math.min(1,open))*20,h=Math.max(0,Math.min(1,heart))*Math.min(1,open*3);
  const mix=(a:number,b:number)=>a+(b-a)*h;
  return `M -10 0 C -10 ${mix(-5,-10)} -5 ${mix(-9,-12)} 0 ${mix(-9,-5)} C 5 ${mix(-9,-12)} 10 ${mix(-5,-10)} 10 0 C 10 ${mix(lower*.55,4)} 5 ${mix(lower,8)} 0 ${mix(lower,12)} C -5 ${mix(lower,8)} -10 ${mix(lower*.55,4)} -10 0 Z`;
}
export function faceMouthPath(smile:number,open:number){
  const opening=Math.max(0,open-.65)*18;
  return `M 44 46 Q 50 ${46+smile*7-opening} 56 46 Q 50 ${46+smile*7+opening} 44 46 Z`;
}
