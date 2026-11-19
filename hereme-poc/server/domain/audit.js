'use strict';
function createAuditService(db){
  const add=db.prepare('INSERT INTO audit_events(actor_id,action,subject_type,subject_id,previous_json,next_json,reason) VALUES(?,?,?,?,?,?,?)');
  return {record({actorId=null,action,subjectType,subjectId=null,previous=null,next=null,reason=''}) {
    add.run(actorId,action,subjectType,subjectId==null?null:String(subjectId),previous==null?null:JSON.stringify(previous),next==null?null:JSON.stringify(next),reason);
  }};
}
module.exports={createAuditService};
