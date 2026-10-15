/* Versioned persistence and durable user/tenant-scoped outbox. */
(function(root) {
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function identity(value, path) {
    if (!object(value)) return null;
    if (path.endsWith('/parentChat') && value.learnerId) return 'learner:'+value.learnerId;
    if (path.endsWith('/sgbPrincipalChat') && value.sgbMember) return 'sgb:'+value.sgbMember;
    if (value.id != null) return 'id:'+value.id;
    if (value.class && value.date) return 'register:'+value.class+':'+value.date;
    if (value.class && value.week) return 'week:'+value.class+':'+value.week;
    if (value.class && value.weekStart) return 'week:'+value.class+':'+value.weekStart;
    if (value.class && value.term) return 'report:'+value.class+':'+value.term;
    return null;
  }
  function merge(base,local,remote,path='',conflicts=[]) {
    if (same(local,base)) return clone(remote);
    if (same(remote,base) || same(local,remote)) return clone(local);
    if (object(local) && object(remote) && (object(base) || base === undefined)) {
      const result={};
      for (const key of new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)])) {
        const value=merge(base?.[key],local[key],remote[key],path+'/'+key,conflicts);
        if (value !== undefined) result[key]=value;
      }
      return result;
    }
    if (Array.isArray(local) && Array.isArray(remote) && (Array.isArray(base) || base === undefined)) {
      base=base||[];
      const keyed = list => list.every(value=>identity(value,path)) && new Set(list.map(v=>identity(v,path))).size===list.length;
      if ([base,local,remote].every(keyed)) {
        const index=list=>new Map(list.map(v=>[identity(v,path),v])), b=index(base),l=index(local),r=index(remote),result=[];
        for (const key of new Set([...remote.map(v=>identity(v,path)),...local.map(v=>identity(v,path)),...base.map(v=>identity(v,path))])) {
          const value=merge(b.get(key),l.get(key),r.get(key),path+'/'+key,conflicts);
          if (value !== undefined) result.push(value);
        }
        return result;
      }
      const prefix=list=>list.length>=base.length && base.every((v,i)=>same(v,list[i]));
      if (prefix(local) && prefix(remote) && local.slice(base.length).every(object)) {
        const result=clone(remote);
        for (const value of local.slice(base.length)) if (!value.id || !result.some(v=>v?.id===value.id)) result.push(clone(value));
        return result;
      }
    }
    conflicts.push({path,base:clone(base),local:clone(local),remote:clone(remote)});
    return clone(local); // Visible pending draft, never written until reviewed.
  }
  function normalise(base,local,uuid) {
    if (Array.isArray(local)) {
      const previous=Array.isArray(base)?base:[];
      return local.map((value,i)=>{
        const prior=object(value) && value.id ? previous.find(old=>old?.id===value.id) : previous[i];
        const next=normalise(prior,value,uuid);
        if (object(next) && !prior && !next.id && !next.class && !next.learnerId && !next.sgbMember) next.id=uuid();
        return next;
      });
    }
    if (!object(local)) return clone(local);
    return Object.fromEntries(Object.entries(local).map(([key,value])=>[key,normalise(base?.[key],value,uuid)]));
  }
  function create(options) {
    const {storage,key,rpc,onStatus=()=>{},onSnapshot=()=>{},onConfirmed=()=>{},online=()=>true,uuid=()=>crypto.randomUUID()}=options;
    let state={snapshot:null,jobs:[]}, running=null, blocked=null;const results=new Map();
    try {state=JSON.parse(storage.getItem(key)||'null')||state;} catch(error) {onStatus('Sync failed','The saved outbox could not be read. It has not been overwritten.');throw error;}
    const persist=()=>storage.setItem(key,JSON.stringify(state));
    const view=()=>state.jobs.filter(j=>j.kind==='mutation').reduce((current,j)=>merge(j.base,j.local,current),clone(state.snapshot?.payload||{}));
    const publish=()=>onSnapshot(view(),state.snapshot?.version);
    async function read() {
      const response=await rpc('read_workspace_snapshot',{});
      if(response.error || !response.data || !Number.isInteger(response.data.version)) throw new Error(response.error?.message||'The server workspace could not be loaded.');
      state.snapshot=response.data;persist();publish();return response.data;
    }
    async function run() {
      if(!state.jobs.length) return {ok:true};
      if(!online()) {onStatus('Offline/pending','Changes are retained on this device.');return {ok:false,pending:true};}
      onStatus('Saving','Waiting for Supabase confirmation.');blocked=null;
      try {
        await read();
        while(state.jobs.length) {
          const job=state.jobs[0];let response;
          if(job.kind==='mutation') {
            const receipt=await rpc('workspace_request_status',{p_request_id:job.id});
            if(receipt.error) throw new Error(receipt.error.message);
            if(receipt.data?.processed) {
              state.snapshot=receipt.data.snapshot;state.jobs.shift();persist();publish();results.set(job.id,receipt.data.result);onConfirmed(job,receipt.data.result);continue;
            }
            const conflicts=[],desired=merge(job.base,job.local,state.snapshot.payload,'',conflicts);
            if(conflicts.length) {blocked={job,conflicts};onStatus('Sync failed','Conflicting edits require review. Your draft is retained.',blocked);return {ok:false,conflict:true};}
            const changes=Object.fromEntries(Object.keys(desired).filter(k=>!same(desired[k],state.snapshot.payload[k]) && !['__v','notifications','chatExtras'].includes(k)).map(k=>[k,desired[k]]));
            if(!Object.keys(changes).length) response={data:{snapshot:state.snapshot,result:true}};
            else response=await rpc('compare_and_save_workspace',{p_request_id:job.id,p_expected_version:state.snapshot.version,p_changes:changes});
            if(response.data?.conflict) {state.snapshot=response.data.snapshot;persist();publish();job.attempts=(job.attempts||0)+1;if(job.attempts<4) continue;throw new Error('The workspace is busy. Your changes are retained; retry shortly.');}
          } else response=await rpc('perform_workspace_action',{p_request_id:job.id,p_kind:job.kind,p_args:job.args});
          if(response.error || !response.data?.snapshot) {
            if(response.error?.code==='40001') blocked={job,conflicts:[{path:'/'+job.kind,local:job.args,remote:state.snapshot.payload.announcements?.find(a=>a.id===job.args.p_id)}]};
            throw new Error(response.error?.message||'Supabase did not confirm this save.');
          }
          state.snapshot=response.data.snapshot;state.jobs.shift();persist();publish();results.set(job.id,response.data.result);onConfirmed(job,response.data.result);
        }
        onStatus('Saved','Supabase confirmed all queued changes.');return {ok:true};
      } catch(error) {
        onStatus(online()?'Sync failed':'Offline/pending',error.message,blocked);return {ok:false,pending:true,error:error.message};
      }
    }
    function flush() {if(!running) running=run().finally(()=>{running=null;});return running;}
    return {
      read,flush,view,hasPending:()=>state.jobs.length>0,getState:()=>clone(state),getConflict:()=>blocked,
      accept(snapshot) {if(!state.snapshot || snapshot.version>=state.snapshot.version) {state.snapshot=clone(snapshot);persist();publish();}},
      async mutation(base,local) {
        const next=normalise(base,local,uuid);
        if(!same(base,next) && !state.jobs.some(j=>j.kind==='mutation' && same(j.local,next))) {
          const job={id:uuid(),kind:'mutation',base:clone(base),local:next};state.jobs.push(job);
          try {persist();} catch(error) {state.jobs.pop();onStatus('Sync failed','Device storage is full or unavailable. Keep this form open and retry.');return {ok:false,error:error.message};}
          publish();
        }
        return flush();
      },
      async command(kind,args) {
        const matching=state.jobs.find(j=>j.kind===kind && same(j.args,args));
        const id=matching?.id||uuid();
        if(!matching) {state.jobs.push({id,kind,args:clone(args)});try{persist();}catch(error){state.jobs.pop();onStatus('Sync failed','Device storage is unavailable. Keep the form open.');return {ok:false,error:error.message};}}
        const result=await flush();return {...result,ok:!state.jobs.some(j=>j.id===id),id,result:results.get(id)};
      },
      async resolve(useLocal) {
        if(!blocked) return {ok:false};const job=blocked.job;
        if(job.kind==='mutation') {const conflicts=[],desired=merge(job.base,job.local,state.snapshot.payload,'',conflicts);
          const choose=(base,local,remote)=>merge(base,local,remote); // Rebase only after explicit review.
          if(useLocal) job.local=desired;
          else {
            function serverWins(base,local,remote,path='') {
              if(conflicts.some(c=>c.path===path)) return clone(remote);
              if(object(local)&&object(remote)) return Object.fromEntries([...new Set([...Object.keys(local),...Object.keys(remote)])].map(k=>[k,serverWins(base?.[k],local[k],remote[k],path+'/'+k)]));
              if(Array.isArray(local)&&Array.isArray(remote)&&local.every(v=>identity(v,path))&&remote.every(v=>identity(v,path))) {
                const b=new Map((base||[]).map(v=>[identity(v,path),v])),l=new Map(local.map(v=>[identity(v,path),v])),r=new Map(remote.map(v=>[identity(v,path),v]));
                return [...new Set([...r.keys(),...l.keys()])].map(k=>serverWins(b.get(k),l.get(k),r.get(k),path+'/'+k)).filter(v=>v!==undefined);
              }
              return choose(base,local,remote);
            }
            job.local=serverWins(job.base,job.local,state.snapshot.payload);
          }
          job.base=clone(state.snapshot.payload);
        } else if(useLocal) job.args.expectedRecord=clone(state.snapshot.payload.announcements?.find(a=>a.id===job.args.p_id));
        else state.jobs=state.jobs.filter(j=>j.id!==job.id);
        blocked=null;persist();return flush();
      }
    };
  }
  root.SchoolShieldSync={create,merge,normalise};
})(typeof window==='undefined'?globalThis:window);
