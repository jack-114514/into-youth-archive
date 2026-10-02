import type { DragReaction } from "./moling-drag";
import type { MolingPose } from "./moling";
export const rigAsset = "/assets/desktop-pet/moling/rig-v2.png";
// Bounds of the six transparent atlas components, measured without editing PNG pixels.
export const rigParts = {
  body: { cell: 0, bounds: [83,51,493,492], box: [72,107,156,168] },
  left: { cell: 1, bounds: [156,189,400,422], box: [40,218,47,45] },
  right: { cell: 2, bounds: [106,192,353,410], box: [213,215,47,42] },
  plume: { cell: 3, bounds: [102,14,473,478], box: [120,14,99,124] },
  tail: { cell: 4, bounds: [28,18,502,466], box: [85,254,127,120] },
  jade: { cell: 5, bounds: [108,102,394,389], box: [53,91,55,55] },
} as const;
export type RigPart = keyof typeof rigParts;
export function rigPartLayout(part: RigPart) {
  const {cell,bounds,box}=rigParts[part];
  const [l,t,r,b]=bounds,[x,y,width,height]=box;
  return { x,y,width,height, backgroundX: cell%3*50, backgroundY: Math.floor(cell/3)*100,
    spriteWidth:512/(r-l)*100,spriteHeight:512/(b-t)*100,
    offsetX:-l/(r-l)*100,offsetY:-t/(b-t)*100 };
}
export type RigMotion = { y:number; tilt:number; yaw:number; eye:number; gazeX:number; gazeY:number; blush:number; mouth:number; left:number; right:number; handY:number; leftX:number; rightX:number; rightY:number; tail:number; plume:number; jade:number; glow:number };
export const rigRest:RigMotion={y:0,tilt:0,yaw:1,eye:.2,gazeX:0,gazeY:0,blush:0,mouth:0,left:-8,right:8,handY:0,leftX:0,rightX:0,rightY:0,tail:0,plume:0,jade:0,glow:0};
export function rigTarget(pose:MolingPose,elapsed:number,time:number,idle=true):RigMotion {
  const t=Math.max(0,elapsed),cycle=t/1000;
  const active=Math.sin(Math.PI*Math.min(1,t/1800));
  const value={...rigRest, y:idle?Math.sin(time/750)*2.4:0,tilt:idle?Math.sin(time/1100)*.8:0,
    tail:idle?Math.sin(time/900-1)*4:0,plume:idle?Math.sin(time/1150)*2:0,jade:idle?Math.sin(time/1300)*4:0};
  switch(pose){
    case "blink":value.eye=.015;break;
    case "look":value.eye=.82;value.gazeX=Math.sin(cycle*2.5)*6;value.tilt=Math.sin(cycle*2.5)*3;break;
    case "sleep":value.eye=.025;value.tilt=7;value.y+=4;value.left=-15;value.right=15;break;
    case "wave":value.left=42+Math.sin(cycle*12)*17*active;value.handY=-16;value.eye=.15;break;
    case "jump":value.y-=t<950?30*Math.pow(Math.sin(Math.PI*t/950),2):0;value.left=35*active;value.right=-35*active;value.tail-=10*active;break;
    case "turn":value.yaw=.74;value.gazeX=8;value.eye=.8;value.tilt=3;value.left=-20;value.right=-14;break;
    case "cast":value.right=-48;value.rightY=-14;value.eye=.8;value.glow=1;value.jade+=12;break;
    case "thinking":value.eye=.68;value.gazeX=-4;value.gazeY=-4;value.tilt=-5;value.left=24;value.handY=-27;value.leftX=18;break;
    case "shy":value.eye=.16;value.blush=1;value.tilt=4;value.left=8;value.right=-8;value.handY=12;value.rightY=12;value.leftX=30;value.rightX=-30;break;
    case "surprised":value.eye=1;value.mouth=1;value.left=32;value.right=-32;value.tilt=-2;break;
    case "complete":value.eye=.13;value.blush=.35;value.right=-42;value.rightY=-10;value.glow=.45;break;
  }
  return value;
}
// Closed-form critically damped spring: retains both position and velocity when interrupted.
export function rigSpring(value:number,velocity:number,target:number,seconds:number,frequency=16){
  const dt=Math.max(0,Math.min(.1,seconds)),d=value-target,c=velocity+frequency*d,decay=Math.exp(-frequency*dt);
  return {value:target+(d+c*dt)*decay,velocity:(velocity-frequency*c*dt)*decay};
}
export function rigEyePath(open:number){
  const lower=-9+Math.max(.015,Math.min(1,open))*20;
  return `M -10 0 C -10 -5 -5 -9 0 -9 C 5 -9 10 -5 10 0 C 10 ${lower*.55} 5 ${lower} 0 ${lower} C -5 ${lower} -10 ${lower*.55} -10 0 Z`;
}

export function rigGoodbyeTarget(elapsed:number,reduced=false):RigMotion {
  const wave=reduced?0:Math.sin(elapsed/75)*15*Math.min(1,elapsed/180);
  const bow=reduced?0:Math.sin(Math.PI*Math.max(0,Math.min(1,(elapsed-650)/450)))*4;
  return {...rigRest,y:reduced?0:-3,tilt:bow,left:52+wave,handY:-18,right:4,tail:reduced?0:-5,plume:reduced?0:2};
}

export function dragRigTarget(reaction:DragReaction,time:number,reduced=false):RigMotion {
  const direction=reduced?0:reaction.direction,swing=reduced?0:Math.sin(time/160),value={...rigRest};
  if(reaction.mode==="lift")Object.assign(value,{y:reduced?0:-8,tilt:direction*5,left:62,right:-62,handY:-12,rightY:-12,tail:-8,plume:4});
  if(reaction.mode==="glide")Object.assign(value,{y:reduced?0:-3,tilt:direction*9,left:28,right:-28,handY:-3,rightY:-3,tail:-direction*16,plume:-direction*9,jade:direction*7,glow:.3});
  if(reaction.mode==="dizzy")Object.assign(value,{y:reduced?0:2+swing*2,tilt:direction*5+swing*5,left:12+swing*8,right:-12-swing*8,handY:5,rightY:5,tail:-direction*12-swing*7,plume:swing*5});
  if(reduced){value.tail=0;value.plume=0;value.jade=0;}
  return value;
}
