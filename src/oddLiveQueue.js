"use strict";
const crypto = require("node:crypto");

/**
 * One GPU render may be active per show. Once the worker has queued its clip,
 * the render slot is released while its delivery token remains pending. This
 * lets the worker prepare the next answer while the current clip is on air.
 */
function createProducerLeases({ttlMs=60*60*1000,now=()=>Date.now()}={}) {
  const active=new Map();
  const pending=new Map();
  function cleanup() {
    for(const [dropId,lease] of active) if(lease.expiresAt<=now()) active.delete(dropId);
    for(const [token,lease] of pending) if(lease.expiresAt<=now()) pending.delete(token);
  }
  function equalToken(gotValue,expectedValue) {
    if(typeof gotValue!=="string"||typeof expectedValue!=="string")return false;
    const got=Buffer.from(gotValue),expected=Buffer.from(expectedValue);
    return got.length===expected.length&&crypto.timingSafeEqual(got,expected);
  }
  function check(dropId,token) {
    cleanup();
    const running=active.get(dropId);
    if(running&&equalToken(token,running.token))return {...running};
    const queued=pending.get(token);
    if(queued&&queued.dropId===dropId&&equalToken(token,queued.token))return {...queued};
    return null;
  }
  return {
    acquire(dropId,questionId,metadata=null) {
      cleanup();
      if(active.has(dropId))return null;
      const token=crypto.randomBytes(24).toString("hex");
      const lease={dropId,questionId:questionId??null,metadata:metadata&&typeof metadata==="object"?{...metadata}:null,token,expiresAt:now()+ttlMs};
      active.set(dropId,lease);
      return {...lease};
    },
    check,
    release(dropId,token,{keepForAck=false}={}) {
      const lease=check(dropId,token);
      if(!lease)return false;
      if(active.get(dropId)?.token===token)active.delete(dropId);
      if(keepForAck)pending.set(token,lease);
      else pending.delete(token);
      return true;
    },
    has(dropId) {cleanup();return active.has(dropId);},
    hasPendingPresentation(dropId,productId) {
      cleanup();
      return [...pending.values()].some(lease=>lease.dropId===dropId&&lease.questionId===null&&
        (productId==null||Number(lease.metadata?.productId)===Number(productId)));
    },
    hasPendingQuestion(dropId,questionId) {
      cleanup();
      return [...pending.values()].some(lease=>lease.dropId===dropId&&
        (Array.isArray(lease.questionId)?lease.questionId:[lease.questionId]).some(id=>Number(id)===Number(questionId)));
    },
  };
}
module.exports={createProducerLeases};
