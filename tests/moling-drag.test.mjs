import test from 'node:test';
import assert from 'node:assert/strict';
import {MolingDrag,dragFaces} from '../components/desktop-pet/moling-drag.ts';
import {faceTargets,faceEyePath,faceMouthPath} from '../components/desktop-pet/moling-face.ts';
import {rigGoodbyeTarget,rigSpring,dragRigTarget} from '../components/desktop-pet/moling-rig.ts';

test('no drag expression on hover, stationary press, tiny movement or another pointer',()=>{
 const d=new MolingDrag();assert.equal(d.state(100),null);d.move(1,500,600,100);assert.equal(d.state(100),null);
 d.begin(1,100,100,100);assert.equal(d.state(150),null);d.move(1,102,102,160);assert.equal(d.state(170),null);
 d.move(2,300,300,180);assert.equal(d.state(190),null);
});
test('real drag transitions from lift to glide, fast/reversed motion briefly turns dizzy',()=>{
 const d=new MolingDrag();d.begin(1,100,100,0);d.move(1,110,100,100);assert.equal(d.state(101).mode,'lift');
 d.move(1,120,100,850);assert.equal(d.state(851).mode,'glide');
 d.move(1,220,100,900);assert.equal(d.state(901).mode,'dizzy');assert.equal(d.state(1801).mode,'glide');
 d.move(1,250,100,1900);d.move(1,215,100,2000);assert.equal(d.state(2001).mode,'dizzy');
 d.end();assert.equal(d.state(2002),null);
});
test('new gestures reset between drags and held drag outlasts normal action lifetimes',()=>{
 const d=new MolingDrag();d.begin(1,0,0,0);d.move(1,10,0,10);assert.equal(d.state(100000).mode,'glide');assert.ok(d.state(100000).speed<1e-6);
 d.end();d.begin(2,0,0,100100);assert.equal(d.state(100200),null);d.move(2,-10,0,100300);assert.equal(d.state(100301).mode,'lift');assert.ok(d.state(100301).direction<0);
});
test('three drag faces are unique and excluded from all ordinary AI faces',()=>{
 assert.equal(Object.keys(dragFaces).length,3);const faces=new Set(Object.values(faceTargets).map(f=>JSON.stringify(f)));
 for(const f of Object.values(dragFaces)){assert.ok(!faces.has(JSON.stringify(f)));faces.add(JSON.stringify(f));assert.ok(!/NaN|Infinity/.test(faceEyePath(f.left)+faceMouthPath(f.smile,f.mouth)));}
});
test('corresponding body motions remain bounded, distinct and reduced-motion safe',()=>{
 const motions=[];for(const mode of Object.keys(dragFaces)){
  for(let t=0;t<5000;t+=15){const r={mode,elapsed:t,direction:Math.sin(t/100),speed:1},target=dragRigTarget(r,t);assert.ok(Object.values(target).every(Number.isFinite));assert.ok(Math.abs(target.tilt)<=10&&Math.abs(target.y)<=8);}
  const r={mode,elapsed:100,direction:1,speed:1};motions.push(JSON.stringify(dragRigTarget(r,500)));const a=dragRigTarget(r,100,true),b=dragRigTarget(r,800,true);assert.deepEqual(a,b);assert.equal(a.y,0);assert.equal(a.tilt,0);assert.equal(a.tail,0);
 }assert.equal(new Set(motions).size,3);
});
test('release recovers smoothly from drag to normal without a position jump',()=>{
 const before=dragRigTarget({mode:'glide',elapsed:1000,direction:1,speed:1},1000);
 const next=rigSpring(before.tilt,0,0,1/30,18);assert.ok(next.value>6&&next.value<before.tilt);
 let x=next.value,v=next.velocity;for(let i=0;i<40;i++){const n=rigSpring(x,v,0,1/30,18);x=n.value;v=n.velocity;}assert.ok(Math.abs(x)<.001);
});
test('goodbye raises and waves a hand before a gentle bow; static version never sways',()=>{
 const start=rigGoodbyeTarget(0),mid=rigGoodbyeTarget(750);assert.ok(start.left>45&&start.handY<0);assert.ok(mid.tilt>0);
 assert.notEqual(rigGoodbyeTarget(200).left,rigGoodbyeTarget(400).left);
 assert.deepEqual(rigGoodbyeTarget(100,true),rigGoodbyeTarget(900,true));
 for(let t=0;t<1300;t+=20){const a=rigGoodbyeTarget(t),b=rigGoodbyeTarget(t+20);assert.ok(Object.values(a).every(Number.isFinite));assert.ok(Math.abs(a.left-b.left)<4.1);}
});
