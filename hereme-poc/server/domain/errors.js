'use strict';
class DomainError extends Error {
  constructor(code,message,status=400,details=null){super(message);this.name='DomainError';this.code=code;this.status=status;this.details=details;}
}
const fail=(code,message,status=400,details=null)=>{throw new DomainError(code,message,status,details);};
module.exports={DomainError,fail};
