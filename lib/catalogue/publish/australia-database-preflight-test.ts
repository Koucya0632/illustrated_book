/** ISOLATED TEST ONLY. Read-only identity / ACL experiment, never an apply gate.
 * PostgreSQL ACLs alone do not establish RLS/trigger behavior or target identity. */
import {createHash} from 'node:crypto';
import postgres from 'postgres';
type Sql=ReturnType<typeof postgres>;
type TablePermission='SELECT'|'INSERT'|'UPDATE'|'DELETE';
type SequencePermission='USAGE'|'SELECT'|'UPDATE';
export type TestTableRequirement={schema:string;table:string;permissions:TablePermission[]};
export type TestSequenceRequirement={schema:string;table:string;column:string;permissions:SequencePermission[]};
export type TestRequirements={tables:TestTableRequirement[];sequences:TestSequenceRequirement[]};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function ensure(v:unknown,msg:string):asserts v{if(!v)throw new Error(msg)}
function validId(s:string){return /^[a-z_][a-z0-9_]{0,62}$/.test(s)}
function isolated(url:string,sql:Sql){
 const u=new URL(url);ensure(['127.0.0.1','localhost','[::1]'].includes(u.hostname)&&u.pathname==='/tuji_au_test'&&sql.options.host.length===1&&sql.options.host[0]===u.hostname&&sql.options.port.length===1&&Number(sql.options.port[0])===Number(u.port||5432)&&sql.options.database==='tuji_au_test'&&sql.options.user===decodeURIComponent(u.username),'preflight restricted to matching isolated localhost database');return u;
}
function normalize(r:TestRequirements){
 ensure(r.tables.length>0&&r.sequences.length>0,'empty requirements are not allowed');
 const tables=r.tables.map(x=>({schema:x.schema,table:x.table,permissions:[...x.permissions].sort()})).sort((a,b)=>`${a.schema}.${a.table}`.localeCompare(`${b.schema}.${b.table}`));
 const sequences=r.sequences.map(x=>({schema:x.schema,table:x.table,column:x.column,permissions:[...x.permissions].sort()})).sort((a,b)=>`${a.schema}.${a.table}.${a.column}`.localeCompare(`${b.schema}.${b.table}.${b.column}`));
 ensure(tables.every(x=>validId(x.schema)&&validId(x.table)&&x.permissions.length>0&&x.permissions.every(p=>['SELECT','INSERT','UPDATE','DELETE'].includes(p))&&new Set(x.permissions).size===x.permissions.length)&&new Set(tables.map(x=>`${x.schema}.${x.table}`)).size===tables.length,'invalid table requirements');
 ensure(sequences.every(x=>validId(x.schema)&&validId(x.table)&&validId(x.column)&&x.permissions.length>0&&x.permissions.every(p=>['USAGE','SELECT','UPDATE'].includes(p))&&new Set(x.permissions).size===x.permissions.length)&&new Set(sequences.map(x=>`${x.schema}.${x.table}.${x.column}`)).size===sequences.length,'invalid sequence requirements');return {tables,sequences};
}
/** On missing identity pin this is an observation only. Identity digest is
 * deliberately independent of the URL password, query string and secret. */
export async function inspectAustralianTestDatabase(url:string,sql:Sql,requirements:TestRequirements,expectedIdentity?:string){
 const u=isolated(url,sql),normalized=normalize(requirements),requirementsDigest=hash(JSON.stringify(normalized));
 ensure(expectedIdentity===undefined||/^[a-f0-9]{64}$/.test(expectedIdentity),'invalid identity pin');
 try{return await sql.begin('read only',async(tx)=>{
  const [id]=await tx`SELECT current_database() AS database_name,current_user AS current_role,session_user AS session_role,inet_server_addr()::text AS server_addr,inet_server_port() AS server_port,pg_postmaster_start_time()::text AS postmaster_started,pg_is_in_recovery() AS replica,current_setting('transaction_read_only') AS transaction_read_only,has_database_privilege(current_user,current_database(),'CONNECT') AS can_connect`;
  ensure(id.database_name==='tuji_au_test'&&id.replica===false&&id.transaction_read_only==='on','unexpected database or transaction is not read-only');
  const identityDigest=hash(JSON.stringify({version:1,configuredHost:u.hostname,configuredPort:Number(u.port||5432),database:id.database_name,role:id.current_role,sessionRole:id.session_role,serverAddress:id.server_addr,serverPort:id.server_port,postmasterStarted:id.postmaster_started}));
  if(expectedIdentity!==undefined&&expectedIdentity!==identityDigest)return {identityDigest,requirementsDigest,identityStatus:'mismatch' as const,aclStatus:'not-checked' as const,productionWriteAllowed:false,objects:[]};
  const objects:Array<{kind:string;name:string;exists:boolean;schemaUsage:boolean;permissions:Record<string,boolean>;rowSecurityEnabled:boolean|null}>=[];
  for(const table of normalized.tables){
   const [x]=await tx`SELECT c.oid,c.relkind,c.relrowsecurity,COALESCE(has_schema_privilege(current_user,n.oid,'USAGE'),false) AS schema_usage FROM pg_namespace n JOIN pg_class c ON c.relnamespace=n.oid WHERE n.nspname=${table.schema} AND c.relname=${table.table} AND c.relkind IN ('r','p')`;
   const permissions:Record<string,boolean>={};for(const permission of table.permissions){if(x){const [p]=await tx`SELECT has_table_privilege(current_user,${x.oid}::oid,${permission}) AS allowed`;permissions[permission]=Boolean(p.allowed)}else permissions[permission]=false}
   objects.push({kind:'table',name:`${table.schema}.${table.table}`,exists:Boolean(x),schemaUsage:Boolean(x?.schema_usage),permissions,rowSecurityEnabled:x?Boolean(x.relrowsecurity):null});
  }
  for(const seq of normalized.sequences){
   const [schema]=await tx`SELECT has_schema_privilege(current_user,oid,'USAGE') AS permitted FROM pg_namespace WHERE nspname=${seq.schema}`;
   const [x]=schema?.permitted?await tx`SELECT CASE WHEN EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass(format('%I.%I',${seq.schema}::text,${seq.table}::text)) AND attname=${seq.column} AND attnum>0 AND NOT attisdropped) THEN pg_get_serial_sequence(format('%I.%I',${seq.schema}::text,${seq.table}::text),${seq.column}) ELSE NULL END AS sequence`:[{sequence:null}];
   const permissions:Record<string,boolean>={};let exists=false,schemaUsage=false;
   if(x.sequence){const [found]=await tx`SELECT c.oid,has_schema_privilege(current_user,n.oid,'USAGE') AS schema_usage FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=to_regclass(${x.sequence}) AND c.relkind='S'`;if(found){exists=true;schemaUsage=Boolean(found.schema_usage);for(const permission of seq.permissions){const [p]=await tx`SELECT has_sequence_privilege(current_user,${found.oid}::oid,${permission}) AS allowed`;permissions[permission]=Boolean(p.allowed)}}}
   if(!exists)for(const permission of seq.permissions)permissions[permission]=false;
   objects.push({kind:'sequence',name:`${seq.schema}.${seq.table}.${seq.column}`,exists,schemaUsage,permissions,rowSecurityEnabled:null});
  }
  const missing=!id.can_connect||objects.some(x=>!x.exists||!x.schemaUsage||Object.values(x.permissions).some(v=>!v));
  return {identityDigest,requirementsDigest,identityStatus:expectedIdentity?'matched' as const:'unpinned' as const,aclStatus:missing?'missing' as const:objects.some(x=>x.rowSecurityEnabled)?'inconclusive-rls' as const:'grants-present-only' as const,productionWriteAllowed:false,objects};
 })}catch{throw new Error('isolated read-only preflight failed; credentials and connection details suppressed')}
}
