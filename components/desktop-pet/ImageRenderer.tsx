"use client";
import { useEffect, useRef, useState } from "react";
import type { PetCue, PetSettings } from "./settings";
export default function ImageRenderer({settings,cue,paused,onStatus}:{settings:PetSettings;cue:PetCue|null;paused:boolean;showLoading?:boolean;onHit:(areas:string[])=>void;onStatus?:(status:"loading"|"ready"|"error")=>void}) {
  const [status,setStatus]=useState<"loading"|"ready"|"error">("loading");
  const listener=useRef(onStatus);
  useEffect(()=>{listener.current=onStatus;},[onStatus]);
  useEffect(()=>{listener.current?.(status);},[status]);
  return <div className={`pet-renderer pet-image-renderer ${cue?.action==="wave"?"is-waving":""}`} data-status={status} style={{animationPlayState:paused?"paused":"running"}}>
    <img key={settings.modelUrl} src={settings.modelUrl} alt={settings.name} draggable={false} referrerPolicy="no-referrer" onLoad={()=>setStatus("ready")} onError={()=>setStatus("error")} style={{width:"100%",height:"100%",objectFit:"contain",transform:`scale(${settings.scale})`}} />
    {status==="error"&&<p className="pet-load-status" role="alert">自定义图片加载失败，请检查资源地址。</p>}
  </div>;
}
