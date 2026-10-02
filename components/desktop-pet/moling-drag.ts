import type { FaceMotion } from "./moling-face";

export const dragLabels={lift:"被拎起 · 慌张",glide:"乘风 · 开心",dizzy:"晃晕 · 委屈"} as const;
export type DragMode=keyof typeof dragLabels;
export type DragReaction={mode:DragMode;elapsed:number;direction:number;speed:number};
export const dragFaces:Record<DragMode,FaceMotion>={
  lift:{left:1,right:.95,brow:-.95,asymmetry:.1,smile:0,mouth:.98,blush:.2,tears:0,hearts:0,sparkle:0},
  glide:{left:.25,right:.35,brow:-.45,asymmetry:.25,smile:1,mouth:.9,blush:.55,tears:0,hearts:0,sparkle:.6},
  dizzy:{left:.38,right:.48,brow:-.7,asymmetry:-.7,smile:-.7,mouth:.82,blush:.35,tears:.55,hearts:0,sparkle:0},
};

// Only a captured mouse gesture that travels 5px can activate these reactions.
export class MolingDrag {
  private pointer:number|null=null;
  private origin={x:0,y:0};
  private previous={x:0,y:0,time:0};
  private start:number|null=null;
  private vx=0;
  private vy=0;
  private dizzyUntil=0;
  begin(pointer:number,x:number,y:number,now:number){
    this.end();this.pointer=pointer;this.origin={x,y};this.previous={x,y,time:now};
  }
  move(pointer:number,x:number,y:number,now:number){
    if(pointer!==this.pointer)return;
    if(this.start===null&&Math.hypot(x-this.origin.x,y-this.origin.y)<5)return;
    if(this.start===null)this.start=now;
    const dt=Math.max(.008,(now-this.previous.time)/1000),vx=(x-this.previous.x)/dt,vy=(y-this.previous.y)/dt;
    const reverse=this.vx*vx+this.vy*vy<0 && Math.hypot(this.vx,this.vy)>150 && Math.hypot(vx,vy)>150;
    if(now-this.start>=650&&(Math.hypot(vx,vy)>900||reverse))this.dizzyUntil=now+800;
    const blend=1-Math.exp(-Math.min(.1,dt)*14);
    this.vx+=(vx-this.vx)*blend;this.vy+=(vy-this.vy)*blend;this.previous={x,y,time:now};
  }
  state(now:number):DragReaction|null {
    if(this.start===null)return null;
    const decay=Math.exp(-Math.max(0,now-this.previous.time)/220);
    return {mode:now-this.start<650?"lift":now<this.dizzyUntil?"dizzy":"glide",elapsed:Math.max(0,now-this.start),direction:Math.max(-1,Math.min(1,this.vx*decay/700)),speed:Math.min(1,Math.hypot(this.vx,this.vy)*decay/900)};
  }
  end(){this.pointer=null;this.start=null;this.vx=0;this.vy=0;this.dizzyUntil=0;}
}
