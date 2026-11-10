"use strict";
const crypto = require("node:crypto");

/**
 * A single producer lease, per drop. A worker must ACK only after its
 * audio/video was actually delivered to the program bus.
 * In-memory leases expire on worker failure; database questions remain queued.
 */
function createProducerLeases({ttlMs=120000,now=()=>Date.now()}={}) {
  const active=new Map();
  function cleanup() {
    for(const [dropId, lease] of active) if(lease.expiresAt <= now()) active.delete(dropId);
  }
  return {
    acquire(dropId, questionId) {
      cleanup();
      if (active.has(dropId)) return null;
      const token=crypto.randomBytes(24).toString("hex");
      const lease={dropId,questionId:questionId ?? null,token,expiresAt:now()+ttlMs};
      active.set(dropId,lease);
      return {...lease};
    },
    check(dropId,token) {
      cleanup();
      const lease=active.get(dropId);
      if(!lease || typeof token!=="string") return null;
      const got=Buffer.from(token), expected=Buffer.from(lease.token);
      return got.length===expected.length && crypto.timingSafeEqual(got,expected) ? {...lease} : null;
    },
    release(dropId,token) {
      const lease=this.check(dropId,token);
      if(!lease)return false;
      active.delete(dropId);
      return true;
    },
    has(dropId) {cleanup();return active.has(dropId);},
  };
}
module.exports={createProducerLeases};
