"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { MolingAnimation, molingLabels, type MolingPose } from "./moling";
import { rigAsset, rigEyePath, rigGoodbyeTarget, dragRigTarget, rigPartLayout, rigParts, rigRest, rigSpring, rigTarget, type RigMotion, type RigPart } from "./moling-rig";
import { petFrameRate, type PetCue, type PetSettings } from "./settings";
import { faceEyePath, faceMouthPath, faceTargets, MolingFace, molingGaze, type FaceMotion } from "./moling-face";
import { dragFaces, dragLabels, type MolingDrag } from "./moling-drag";

function Part({part}:{part:RigPart}){
  const p=rigPartLayout(part);
  return <div className={`moling-part moling-part--${part}`} data-part={part} style={{left:`${p.x/3}%`,top:`${p.y/4}%`,width:`${p.width/3}%`,height:`${p.height/4}%`}}>
    <div className="moling-part-sprite" style={{width:`${p.spriteWidth}%`,height:`${p.spriteHeight}%`,left:`${p.offsetX}%`,top:`${p.offsetY}%`,backgroundPosition:`${p.backgroundX}% ${p.backgroundY}%`}} />
  </div>;
}
export default function MolingRenderer({settings,cue,paused,onStatus,dragReaction,departing=false}:{
  settings:PetSettings;cue:PetCue|null;paused:boolean;showLoading?:boolean;
  dragReaction?:{current:MolingDrag};departing?:boolean;
  onStatus:(status:"loading"|"ready"|"error")=>void;onHit:(areas:string[])=>void;
}){
  const [status,setStatus]=useState<"loading"|"ready"|"error">("loading");
  const [pose,setPose]=useState<MolingPose>("float");
  const [reduced,setReduced]=useState(false);
  const root=useRef<HTMLDivElement>(null),animation=useRef(new MolingAnimation());
  const face=useRef(new MolingFace()),faceMotion=useRef<FaceMotion>({...faceTargets.normal});
  const faceVelocity=useRef<FaceMotion>({...faceTargets.normal});
  const gazeMotion=useRef({x:0,y:0,vx:0,vy:0});
  const latest=useRef({settings,onStatus,reduced,dragReaction,departing});
  const swirlMotion=useRef({value:0,velocity:0});
  const motion=useRef<RigMotion>({...rigRest}),velocity=useRef<RigMotion>({...rigRest});
  const glowId=useId(),clipId=useId();
  useEffect(()=>{latest.current={settings,onStatus,reduced,dragReaction,departing};},[settings,onStatus,reduced,dragReaction,departing]);
  useEffect(()=>{
    const media=matchMedia("(prefers-reduced-motion: reduce)"),change=()=>setReduced(media.matches);
    change();media.addEventListener("change",change);return()=>media.removeEventListener("change",change);
  },[]);
  useEffect(()=>{
    let cancelled=false;latest.current.onStatus("loading");const image=new Image();
    image.onload=()=>{if(!cancelled){setStatus("ready");latest.current.onStatus("ready");}};
    image.onerror=()=>{if(!cancelled){setStatus("error");latest.current.onStatus("error");}};image.src=rigAsset;
    return()=>{cancelled=true;};
  },[]);
  useEffect(()=>{
    if(paused){animation.current.reset(performance.now());face.current.reset();gazeMotion.current={x:0,y:0,vx:0,vy:0};setPose("float");return;}
    if(cue){face.current.cue(cue,performance.now());if(animation.current.cue(cue,performance.now()))setPose(animation.current.pose);}
  },[cue,paused]);
  useEffect(()=>{
    if(paused||status!=="ready"||!root.current)return;
    const node=root.current,puppet=node.querySelector<HTMLElement>(".moling-puppet")!;
    const parts=Object.fromEntries(Object.keys(rigParts).map(name=>[name,node.querySelector<HTMLElement>(`[data-part=${name}]`)!])) as Record<RigPart,HTMLElement>;
    const eyes=Array.from(node.querySelectorAll<SVGPathElement>(".moling-eye"));
    const faceNode=node.querySelector<SVGSVGElement>(".moling-face")!;
    const gaze=node.querySelector<SVGGElement>(".moling-gaze")!,blush=node.querySelector<SVGGElement>(".moling-blush")!,mouth=node.querySelector<SVGPathElement>(".moling-mouth")!,particles=node.querySelector<HTMLElement>(".moling-particles")!;
    const brows=Array.from(node.querySelectorAll<SVGPathElement>(".moling-brow"));
    const tears=node.querySelector<SVGGElement>(".moling-tears")!,sparkle=node.querySelector<SVGGElement>(".moling-face-sparkle")!;
    const swirls=node.querySelector<SVGGElement>(".moling-drag-swirls")!;
    let pointer:{x:number;y:number}|null=null;
    const leave=()=>{pointer=null;};
    const move=(event:globalThis.PointerEvent)=>{
      if(event.pointerType!=="mouse"||event.buttons){leave();return;}
      const preview=node.closest(".pet-preview-stage")?.getBoundingClientRect();
      pointer=preview&&(event.clientX<preview.left||event.clientX>preview.right||event.clientY<preview.top||event.clientY>preview.bottom)?null:{x:event.clientX,y:event.clientY};
    };
    window.addEventListener("pointermove",move,{passive:true});window.addEventListener("blur",leave);
    window.addEventListener("pointerdown",leave);document.documentElement.addEventListener("pointerleave",leave);
    document.addEventListener("visibilitychange",leave);
    let frame=0,last=performance.now(),paint=last,start=last,previous=animation.current.pose,goodbyeStart:number|null=null;
    for(const key of Object.keys(velocity.current) as (keyof RigMotion)[])velocity.current[key]=0;
    for(const key of Object.keys(faceVelocity.current) as (keyof FaceMotion)[])faceVelocity.current[key]=0;
    const tick=(now:number)=>{
      const interval=1000/petFrameRate(latest.current.settings.maxFPS),elapsed=now-paint;
      if(!document.hidden&&elapsed>=interval){
        const seconds=Math.min(.1,(now-last)/1000);last=now;paint=now-elapsed%interval;
        const current=animation.current.update(now,latest.current.settings.idleEnabled);setPose(current);
        if(previous!==current){previous=current;start=now;}
        const leaving=latest.current.departing,still=latest.current.reduced;
        const reaction=leaving?null:latest.current.dragReaction?.current.state(now);
        if(leaving&&goodbyeStart===null)goodbyeStart=now;if(!leaving)goodbyeStart=null;
        const goodbyeElapsed=goodbyeStart===null?0:now-goodbyeStart;
        const target=leaving?rigGoodbyeTarget(goodbyeElapsed,still):reaction?dragRigTarget(reaction,now,still):rigTarget(current,now-start,now,!still&&latest.current.settings.idleEnabled);
        node.dataset.drag=reaction?.mode||"none";node.dataset.action=leaving?"goodbye":reaction?`drag-${reaction.mode}`:current;
        node.querySelector(".moling-art")?.setAttribute("aria-label",`墨灵 · ${leaving?"挥手再见":reaction?dragLabels[reaction.mode]:molingLabels[current]}`);
        if(still){target.y=0;target.tilt=0;target.tail=0;target.plume=0;target.jade=0;}
        for(const key of Object.keys(target) as (keyof RigMotion)[]){
          const next=rigSpring(motion.current[key],velocity.current[key],target[key],seconds,key==="tail"||key==="plume"?10:key==="eye"&&current==="blink"?50:18);
          motion.current[key]=still?target[key]:next.value;velocity.current[key]=still?0:next.velocity;
        }
        const m=motion.current;
        const art=node.querySelector<HTMLElement>(".moling-art")!;
        art.style.opacity=String(leaving?1-Math.max(0,Math.min(1,(goodbyeElapsed-(still?230:1000))/(still?120:250))):1);
        puppet.style.transform=`translateY(${m.y}px) rotate(${m.tilt}deg) scaleX(${m.yaw})`;
        parts.left.style.transform=`translate(${m.leftX}px, ${m.handY}px) rotate(${m.left}deg)`;
        parts.right.style.transform=`translate(${m.rightX}px, ${m.rightY}px) rotate(${m.right}deg)`;
        parts.tail.style.transform=`rotate(${m.tail}deg) scaleY(${1-m.y/450})`;
        parts.plume.style.transform=`rotate(${m.plume}deg)`;
        parts.jade.style.transform=`translateY(${Math.sin(now/1100)*(still?0:3)}px) rotate(${m.jade}deg)`;
        parts.jade.style.filter=`drop-shadow(0 0 ${m.glow*5}px #90edbb)`;
        const emotion=leaving?"happy":face.current.update(now,latest.current.settings.idleEnabled),facial={...(reaction?dragFaces[reaction.mode]:faceTargets[emotion])};
        node.dataset.emotion=reaction?`drag-${reaction.mode}`:emotion;
        if(!reaction&&!leaving&&(current==="blink"||current==="sleep")){facial.left=.015;facial.right=.015;}
        for(const key of Object.keys(facial) as (keyof FaceMotion)[]){
          const next=rigSpring(faceMotion.current[key],faceVelocity.current[key],facial[key],seconds,current==="blink"?55:18);
          faceMotion.current[key]=still?facial[key]:next.value;faceVelocity.current[key]=still?0:next.velocity;
        }
        const f=faceMotion.current;
        const swirl=rigSpring(swirlMotion.current.value,swirlMotion.current.velocity,reaction?.mode==="dizzy"?1:0,seconds,18);
        swirlMotion.current={value:still?(reaction?.mode==="dizzy"?1:0):swirl.value,velocity:still?0:swirl.velocity};
        swirls.style.opacity=String(swirlMotion.current.value);
        eyes.forEach((eye,i)=>{eye.setAttribute("d",faceEyePath(i?f.right:f.left,f.hearts));eye.setAttribute("fill",`rgb(${193+f.hearts*54} ${248-f.hearts*72} ${217-f.hearts*15})`);eye.style.opacity=String(1-swirlMotion.current.value*.9);});
        const rect=faceNode.getBoundingClientRect();
        const targetGaze=molingGaze(latest.current.settings.mouseFollow&&!still&&!reaction&&!leaving&&current!=="sleep"?pointer:null,{x:rect.left+rect.width/2,y:rect.top+rect.height/2},latest.current.settings.followStrength);
        const g=gazeMotion.current;
        const gx=rigSpring(g.x,g.vx,targetGaze.x,seconds,14),gy=rigSpring(g.y,g.vy,targetGaze.y,seconds,14);
        g.x=still?0:gx.value;g.y=still?0:gy.value;g.vx=still?0:gx.velocity;g.vy=still?0:gy.velocity;
        gaze.setAttribute("transform",`translate(${g.x} ${g.y})`);
        brows.forEach((b,i)=>{const side=i?-1:1,cx=i?73:27,tilt=f.brow*5+f.asymmetry*(i?3:-3);b.setAttribute("d",`M ${cx-9} ${14-tilt*side} Q ${cx} ${12-Math.abs(f.brow)*2} ${cx+9} ${14+tilt*side}`);b.style.opacity=String(.2+Math.max(Math.abs(f.brow),Math.abs(f.asymmetry))*.8);});
        blush.style.opacity=String(f.blush);mouth.style.opacity=String(.15+f.mouth*.85);mouth.setAttribute("d",faceMouthPath(f.smile,f.mouth));
        tears.style.opacity=String(f.tears);sparkle.style.opacity=String(f.sparkle);
        particles.style.opacity=String(m.glow);
      }else if(document.hidden){last=now;paint=now;}
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(frame);window.removeEventListener("pointermove",move);window.removeEventListener("blur",leave);window.removeEventListener("pointerdown",leave);document.documentElement.removeEventListener("pointerleave",leave);document.removeEventListener("visibilitychange",leave);};
  },[paused,status]);
  const style={"--moling-scale":settings.scale} as CSSProperties;
  return <div ref={root} className={`pet-renderer moling-renderer${reduced?" is-still":""}`} data-status={status} data-pose={pose} data-rig="v2" style={style}>
    {status==="ready"&&<div className="moling-art" role="img" aria-label={`墨灵 · ${molingLabels[pose]}`}>
      <div className="moling-rig-stage"><div className="moling-puppet">
        <Part part="tail"/><Part part="plume"/><Part part="body"/><Part part="jade"/>
        <svg className="moling-face" viewBox="0 0 100 62" aria-hidden="true">
          <defs><filter id={glowId} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.2"/></filter><clipPath id={clipId}><ellipse cx="50" cy="31" rx="49" ry="30"/></clipPath></defs>
          <g clipPath={`url(#${clipId})`}>
          <g className="moling-brows" fill="none" stroke="#a1e2be" strokeWidth="2" strokeLinecap="round"><path className="moling-brow"/><path className="moling-brow"/></g>
          <g className="moling-gaze" fill="#c1f8d9"><path className="moling-eye" transform="translate(27 29)" d={rigEyePath(.78)}/><path className="moling-eye" transform="translate(73 29)" d={rigEyePath(.78)}/></g>
          <g className="moling-drag-swirls" opacity="0" fill="none" stroke="#c1f8d9" strokeWidth="2" strokeLinecap="round"><path transform="translate(27 29)" d="M 0 0 C 5 -4 8 3 2 5 C -7 8 -11 -6 -2 -9 C 8 -13 15 -1 9 8"/><path transform="translate(73 29)" d="M 0 0 C 5 -4 8 3 2 5 C -7 8 -11 -6 -2 -9 C 8 -13 15 -1 9 8"/></g>
          <g className="moling-blush" opacity="0" fill="#ee8d90"><ellipse cx="18" cy="42" rx="9" ry="3.4" filter={`url(#${glowId})`}/><ellipse cx="82" cy="42" rx="9" ry="3.4" filter={`url(#${glowId})`}/></g>
          <path className="moling-mouth" d={faceMouthPath(.15,.15)} fill="#c1f8d9" stroke="#c1f8d9" strokeWidth="1.8" strokeLinejoin="round"/>
          <g className="moling-tears moling-face-accent" opacity="0" fill="#89d9ee"><path d="M 15 34 Q 10 42 15 44 Q 20 42 15 34 Z"/><path d="M 85 34 Q 80 42 85 44 Q 90 42 85 34 Z"/></g>
          <g className="moling-face-sparkle moling-face-accent" opacity="0" fill="#fff2af"><path d="M 15 16 L 17 21 L 22 23 L 17 25 L 15 30 L 13 25 L 8 23 L 13 21 Z"/><path d="M 85 16 L 87 21 L 92 23 L 87 25 L 85 30 L 83 25 L 78 23 L 83 21 Z"/></g>
          </g>
        </svg>
        <Part part="left"/><Part part="right"/>
        <div className="moling-particles" aria-hidden="true">{Array.from({length:5},(_,i)=><i key={i} style={{"--particle":i} as CSSProperties}/>)}</div>
        {pose==="sleep"&&<span className="moling-sleep-mark" aria-hidden="true">z</span>}
        {pose==="complete"&&<span className="moling-complete-mark" aria-hidden="true">✓</span>}
      </div></div>
    </div>}
    {status==="error"&&<p className="pet-load-status" role="alert">墨灵图片加载失败，请刷新重试</p>}
  </div>;
}
