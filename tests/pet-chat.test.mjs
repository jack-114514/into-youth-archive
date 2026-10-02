import test from 'node:test';
import assert from 'node:assert/strict';
import { chatContext, replyStep } from '../components/desktop-pet/chat.ts';

test('long replies remain intact in UI while subsequent requests stay bounded', () => {
  const messages = Array.from({length:5},()=>[{role:'user',content:'u'.repeat(2000)},{role:'assistant',content:'a'.repeat(30000)}]).flat();
  messages.push({role:'user',content:'latest'});
  const context=chatContext(messages);
  assert.equal(context.at(-1).content,'latest');assert.equal(context[0].role,'user');
  assert.ok(context.length<=12);assert.ok(context.reduce((n,m)=>n+m.content.length,0)<=18000);
  assert.ok(context.every(m=>m.content.length<=6000));assert.equal(messages[1].content.length,30000);
});
test('long replies reveal in at most 120 ticks', () => {
  assert.equal(replyStep(100),1);
  for (const length of [501,5000,30000,60000]) assert.ok(Math.ceil(length/replyStep(length))<=120);
});
