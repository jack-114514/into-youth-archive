import assert from 'node:assert/strict';
import test from 'node:test';
import {MolingFace,faceTargets,molingGaze,faceEyePath,faceMouthPath} from '../components/desktop-pet/moling-face.ts';
import {MolingAnimation} from '../components/desktop-pet/moling.ts';
import {rigSpring} from '../components/desktop-pet/moling-rig.ts';
import {emotions} from '../components/desktop-pet/settings.ts';

test('cursor gaze looks in each direction, returns to center, stays inside face even at infinity-scale distances',()=>{
 const c={x:900,y:500};
 for(const dx of [-1e8,-100,-2,0,2,100,1e8])for(const dy of [-1e8,-100,0,100,1e8]){
  const g=molingGaze({x:c.x+dx,y:c.y+dy},c,1);
  assert.ok(Math.abs(g.x)<=6&&Math.abs(g.y)<=3.5);assert.equal(Math.sign(g.x),Math.sign(dx));assert.equal(Math.sign(g.y),Math.sign(dy));
 }
 assert.deepEqual(molingGaze(null,c,1),{x:0,y:0});assert.deepEqual(molingGaze(c,c,1),{x:0,y:0});
 assert.deepEqual(molingGaze({x:0,y:0},c,0),{x:-0,y:-0});
 assert.ok(Math.abs(molingGaze({x:899,y:500},c,1).x)<.05);
});
test('eyes reverse smoothly at both 15 and 30 FPS and recenter after pointer leaves',()=>{
 for(const fps of [15,30]){
  let x=0,v=0;
  for(let i=0;i<fps;i++){const n=rigSpring(x,v,6,1/fps,14);x=n.value;v=n.velocity;}
  const before=x,n=rigSpring(x,v,-6,1/fps,14);assert.ok(Math.abs(n.value-before)<3);
  x=n.value;v=n.velocity;
  for(let i=0;i<fps;i++){const n=rigSpring(x,v,0,1/fps,14);x=n.value;v=n.velocity;}
  assert.ok(Math.abs(x)<.001);
 }
});
test('fourteen unique finite facial targets include wink, heart eyes, tears and excited sparkle',()=>{
 assert.equal(emotions.length,14);assert.deepEqual(Object.keys(faceTargets).sort(),[...emotions].sort());
 assert.equal(new Set(Object.values(faceTargets).map(v=>JSON.stringify(v))).size,14);
 for(const f of Object.values(faceTargets)){
  assert.ok(Object.values(f).every(Number.isFinite));
  assert.ok(!/NaN|Infinity/.test(faceEyePath(f.left,f.hearts)+faceEyePath(f.right,f.hearts)+faceMouthPath(f.smile,f.mouth)));
 }
 assert.ok(faceTargets.wink.right<.02&&faceTargets.wink.left>.8);assert.equal(faceTargets.sad.tears,1);assert.equal(faceTargets.love.hearts,1);assert.equal(faceTargets.excited.sparkle,1);
});
test('face-only cues never start body gestures; facial waiting ends when the reply arrives',()=>{
 const body=new MolingAnimation(),face=new MolingFace();
 for(const [id,emotion] of emotions.entries()){
  const cue={id,emotion,action:'idle'};body.cue(cue,id*6000);face.cue(cue,id*6000);
  assert.equal(body.update(id*6000+10,false),'float');assert.equal(face.update(id*6000+10,false),emotion);
  assert.equal(face.update(id*6000+5500,false),'normal');
 }
 face.cue({id:99,emotion:'thinking',action:'thinking'},100000);assert.equal(face.update(160000,false),'thinking');
 face.cue({id:100,emotion:'confused',action:'idle'},160001);assert.equal(face.update(160002,false),'confused');
 face.reset();assert.equal(face.update(160003,false),'normal');
});
test('duplicate gesture suppression does not suppress a new reply expression',()=>{
 const body=new MolingAnimation(),face=new MolingFace();
 const a={id:1,emotion:'happy',action:'wave'},b={id:2,emotion:'love',action:'wave'};
 body.cue(a,0);face.cue(a,0);assert.equal(body.cue(b,100),false);face.cue(b,100);assert.equal(face.update(101,false),'love');
 face.cue(b,4900);assert.equal(face.update(5200,false),'normal');
});
test('eye and mouth path topology stays consistent during facial interpolation',()=>{
 const commands=s=>s.match(/[A-Za-z]/g).join('');
 for(let t=0;t<=1;t+=.05){assert.equal(commands(faceEyePath(.2+t*.8,t)),commands(faceEyePath(.2)));assert.equal(commands(faceMouthPath(t,t)),commands(faceMouthPath(0,0)));}
});
