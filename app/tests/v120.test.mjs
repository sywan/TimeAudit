import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../src/types.ts';
import {syncWithDrive,validateBackupPayload,restoreDriveBackup} from '../src/drive.ts';

const oldEntry={id:'stale',startAt:'2026-10-20T09:00:00Z',endAt:'2026-10-20T10:00:00Z',activityId:'work.deep',ratings:{importance:null,urgency:null,valueAlignment:null},revision:1,deletedAt:null};

test('backup validation rejects incomplete snapshots',()=>{
  const state=initialState();
  const payload={format:'time-audit-backup',version:1,createdAt:'2026-10-21T00:00:00Z',state};
  assert.equal(validateBackupPayload(payload).state.schemaVersion,'0.2');
  assert.throws(()=>validateBackupPayload({...payload,state:{...state,entries:[{id:'broken',startAt:'x',endAt:'y'}]}}),/incomplete or damaged/);
});

test('a remote restore generation discards stale local entries',async()=>{
  const old=initialState();old.entries=[oldEntry];old.updatedAt='2026-10-20T20:00:00Z';
  const profile={...initialState(),restoreEpoch:'2026-10-21T01:00:00Z',updatedAt:'2026-10-21T01:00:00Z'};
  const original=globalThis.fetch;
  globalThis.fetch=async(input,init={})=>{
    const url=new URL(String(input));
    if(url.pathname==='/drive/v3/files'&&url.searchParams.get('q')?.includes("name = 'Time Audit'"))return Response.json({files:[{id:'root',name:'Time Audit'}]});
    if(url.pathname==='/drive/v3/files'&&url.searchParams.get('q')?.includes("name = 'profile.json'"))return Response.json({files:[{id:'profile',name:'profile.json'}]});
    if(url.pathname==='/drive/v3/files'&&url.searchParams.has('q'))return Response.json({files:[{id:'profile',name:'profile.json'}]});
    if(url.pathname==='/drive/v3/files/profile')return Response.json(profile);
    if(url.pathname==='/upload/drive/v3/files/profile'&&init.method==='PATCH')return Response.json({});
    throw new Error(`Unexpected ${url}`);
  };
  try{const result=await syncWithDrive(old,'token');assert.deepEqual(result.state.entries,[]);assert.equal(result.state.restoreEpoch,profile.restoreEpoch);}
  finally{globalThis.fetch=original;}
});

test('restore archives current Drive files before writing replacement',async()=>{
  const current=initialState();current.entries=[oldEntry];
  const snapshot=initialState();snapshot.entries=[{...oldEntry,id:'restored'}];
  const original=globalThis.fetch,moves=[],uploads=[];
  let backupFolder=false,archiveFolder=false,oldPresent=true;
  globalThis.fetch=async(input,init={})=>{
    const url=new URL(String(input)),q=url.searchParams.get('q')||'';
    if(url.pathname==='/drive/v3/files'&&q.includes("name = 'Time Audit'"))return Response.json({files:[{id:'root',name:'Time Audit'}]});
    if(url.pathname==='/drive/v3/files'&&q.includes("name = 'Backups'"))return Response.json({files:backupFolder?[{id:'backups',name:'Backups'}]:[]});
    if(url.pathname==='/drive/v3/files'&&q.includes('Archive before restore'))return Response.json({files:archiveFolder?[{id:'archive',name:'Archive before restore'}]:[]});
    if(url.pathname==='/drive/v3/files'&&q.includes('name = '))return Response.json({files:[]});
    if(url.pathname==='/drive/v3/files'&&q.includes("'root' in parents"))return Response.json({files:oldPresent?[{id:'old-profile',name:'profile.json'},{id:'old-month',name:'entries-2026-10.json'}]:[]});
    if(url.pathname==='/drive/v3/files'&&init.method==='POST'){
      const meta=JSON.parse(init.body);
      if(meta.name==='Backups'){backupFolder=true;return Response.json({id:'backups'});}
      if(meta.name.startsWith('Archive before restore')){archiveFolder=true;return Response.json({id:'archive'});}
      throw new Error('Unexpected folder');
    }
    if(url.pathname.startsWith('/drive/v3/files/')&&init.method==='PATCH'){
      moves.push([url.pathname,url.searchParams.get('addParents')]);
      if(moves.length===2)oldPresent=false;
      return Response.json({id:url.pathname.split('/').at(-1)});
    }
    if(url.pathname==='/upload/drive/v3/files'&&init.method==='POST'){
      uploads.push(String(init.body));return Response.json({id:`uploaded-${uploads.length}`});
    }
    throw new Error(`Unexpected ${url}`);
  };
  try{
    const result=await restoreDriveBackup(current,snapshot,'token');
    assert.deepEqual(result.state.entries.map(item=>item.id),['restored']);
    assert.equal(moves.length,2);
    assert.ok(uploads[0].includes('before-restore-'));
    assert.ok(uploads.some(body=>body.includes('entries-2026-10.json')));
  }finally{globalThis.fetch=original;}
});
