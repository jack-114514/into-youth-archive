import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { MolingAnimation, molingGesture, molingPoseGeometry, molingPoses } from '../components/desktop-pet/moling.ts';

test('all twelve poses can be selected and return to idle', () => {
  const animation = new MolingAnimation();
  for (const [id, pose] of molingPoses.entries()) {
    assert.equal(animation.cue({ id, pose, action: 'idle' }, id * 5000), true);
    assert.equal(animation.update(id * 5000 + 50, true), pose);
    assert.equal(animation.update(id * 5000 + 4000, true), 'float');
  }
});
test('clicks and replayed cues do not restart an in-progress action', () => {
  const animation = new MolingAnimation();
  assert.equal(animation.cue({ id: 1, action: 'wave' }, 100), true);
  assert.equal(animation.cue({ id: 2, action: 'wave' }, 500), false);
  assert.equal(animation.cue({ id: 1, action: 'wave' }, 500), false);
  assert.equal(animation.cue({ id: 2, randomMotion: true }, 600), false);
  assert.equal(animation.update(2100, true), 'float');
  assert.equal(animation.cue({ id: 3, action: 'wave' }, 2200), true);
});
test('thinking persists while waiting for AI and finishes on a result or error', () => {
  const animation = new MolingAnimation();
  animation.cue({ id: 1, action: 'thinking', emotion: 'thinking' }, 10);
  assert.equal(animation.update(35000, true), 'thinking');
  assert.equal(animation.cue({ id: 2, randomMotion: true }, 35000), false);
  animation.cue({ id: 3, action: 'idle', emotion: 'surprised' }, 35001);
  assert.equal(animation.update(35002, true), 'float');
  assert.equal(animation.update(37000, true), 'float');
});
test('idle blink/look and suspension reset respect their timings', () => {
  const animation = new MolingAnimation();
  animation.reset(1000);
  assert.equal(animation.update(5300, true), 'blink');
  assert.equal(animation.update(5400, true), 'float');
  assert.equal(animation.update(10500, true), 'look');
  assert.equal(animation.update(10500, false), 'float');
  animation.cue({ id: 1, action: 'thinking' }, 11000);
  animation.reset(12000);
  assert.equal(animation.update(12000, true), 'float');
});
test('artwork bytes are preserved and transparent PNGs have the expected grid', () => {
  const root = 'public/assets/desktop-pet/moling/';
  const source = JSON.parse(fs.readFileSync(root + 'SOURCE.json', 'utf8'));
  assert.deepEqual(source.poses, molingPoses);
  for (const [file, hash] of Object.entries(source.files)) {
    const bytes = fs.readFileSync(root + file);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), hash);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    if (file !== 'character-sheet.png') assert.equal(bytes[25], 6, file + ' must retain RGBA');
    if (file === 'poses.png') { assert.equal(bytes.readUInt32BE(16), 1448); assert.equal(bytes.readUInt32BE(20), 1086); }
  }
});
test('normalized bodies share one anchor and size across all twelve poses', () => {
  const bounds = [[153,154,280,295],[143,156,271,295],[119,158,240,295],[104,157,231,300],
    [147,105,294,247],[134,105,296,252],[121,111,252,260],[107,108,238,257],
    [155,74,290,222],[150,76,284,217],[111,75,257,219],[112,74,259,219]];
  for (const [index, pose] of molingPoses.entries()) {
    const geometry = molingPoseGeometry(pose), [l,t,r,b] = bounds[index];
    assert.ok(Math.abs((l+r)/2 * geometry.scale + geometry.translateX/100*362 - 181) < .00001);
    assert.ok(Math.abs((t+b)/2 * geometry.scale + geometry.translateY/100*362 - 190) < .00001);
    assert.ok(Math.abs((b-t)*geometry.scale-142) < .00001);
  }
});
test('gestures ease into and out of motion with a bounded jump and wave', () => {
  for (const pose of ['wave','jump','cast']) {
    const begin = molingGesture(pose,0);
    assert.ok(begin.y === 0 && begin.rotation === 0 && begin.scale === 1);
    for(let time=0;time<=1800;time+=10) {
      const value=molingGesture(pose,time),next=molingGesture(pose,time+10);
      assert.ok(value.y>=-24 && value.y<=0);
      assert.ok(Math.abs(next.y-value.y)<1.1);
      assert.ok(Math.abs(value.rotation)<=3 && value.scale<=1.035);
    }
    const end=molingGesture(pose,1800);
    assert.ok(Math.abs(end.y)+Math.abs(end.rotation)+Math.abs(end.scale-1)<.00001);
  }
});
