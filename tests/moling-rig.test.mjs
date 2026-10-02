import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {rigParts,rigPartLayout,rigRest,rigSpring,rigTarget,rigEyePath} from '../components/desktop-pet/moling-rig.ts';
import {molingPoses} from '../components/desktop-pet/moling.ts';
test('six component atlas is genuinely RGBA and matches recorded production bytes',()=>{
 const bytes=fs.readFileSync('public/assets/desktop-pet/moling/rig-v2.png');
 const source=JSON.parse(fs.readFileSync('public/assets/desktop-pet/moling/RIG-SOURCE.json','utf8'));
 assert.equal(bytes[25],6);assert.equal(bytes.readUInt32BE(16),1536);assert.equal(bytes.readUInt32BE(20),1024);
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),source.sha256);
 assert.equal(Object.keys(rigParts).length,6);
 for(const part of Object.keys(rigParts)){
  const p=rigPartLayout(part);assert.ok(p.width>0&&p.height>0);assert.ok(p.backgroundX>=0&&p.backgroundX<=100&&p.backgroundY>=0&&p.backgroundY<=100);
 }
});
test('all twelve poses use finite, bounded parameters and distinct readable expressions',()=>{
 for(const pose of molingPoses){for(let t=0;t<3500;t+=50){const target=rigTarget(pose,t,10000+t);for(const number of Object.values(target))assert.ok(Number.isFinite(number));assert.ok(target.eye>=0&&target.eye<=1);assert.ok(target.yaw>=.7&&target.yaw<=1);}}
 assert.ok(rigTarget('shy',500,500).blush>.9);assert.ok(rigTarget('surprised',500,500).eye>.9);assert.equal(rigTarget('blink',50,50).eye,.015);assert.ok(rigTarget('thinking',500,500).gazeY<0);
 assert.notEqual(rigEyePath(.2),rigEyePath(1));for(const open of [.015,.2,.68,1])assert.ok(!/NaN|Infinity/.test(rigEyePath(open)));
});
test('critical spring retains momentum when interrupted and settles without overshooting',()=>{
 let value=0,velocity=0;
 for(let i=0;i<9;i++){const next=rigSpring(value,velocity,40,1/30);value=next.value;velocity=next.velocity;assert.ok(value>=0&&value<=40);}
 const before=value,next=rigSpring(value,velocity,-20,1/60);assert.ok(Math.abs(next.value-before)<4);assert.ok(Number.isFinite(next.velocity));value=next.value;velocity=next.velocity;
 for(let i=0;i<120;i++){const n=rigSpring(value,velocity,-20,1/30);value=n.value;velocity=n.velocity;}
 assert.ok(Math.abs(value+20)<.0001&&Math.abs(velocity)<.0001);
});
test('spring results match across 15/30 FPS and can be frozen exactly',()=>{
 function run(fps){let p=0,v=0;for(let i=0;i<fps;i++){const next=rigSpring(p,v,1,1/fps);p=next.value;v=next.velocity;}return p;}
 assert.ok(Math.abs(run(15)-run(30))<1e-9);assert.deepEqual(rigSpring(3,2,9,0),{value:3,velocity:2});
});
test('jump has smooth launch/landing and visible anticipation in limbs and tail',()=>{
 const before=rigTarget('jump',0,0,false),peak=rigTarget('jump',475,475,false),after=rigTarget('jump',950,950,false);
 assert.equal(before.y,0);assert.equal(after.y,0);assert.ok(peak.y<-29);assert.ok(peak.left>0&&peak.right<0&&peak.tail<0);
 for(let t=0;t<1200;t+=10)assert.ok(Math.abs(rigTarget('jump',t+10,0,false).y-rigTarget('jump',t,0,false).y)<1.1);
});
