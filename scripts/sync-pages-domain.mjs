import {readFile,writeFile,rm} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {safePath} from './lib/authoring.mjs';
import {siteAddress,defaultPagesUrl} from './lib/site-config.mjs';

// Repair only the derived local CNAME after confirming the actual Pages setting.
// This script never registers, removes or changes a provider domain or DNS record.
export async function syncPagesDomain(root,{repository,token,request=fetch}={}){
 const env=parseEnv(await readFile(await safePath(root,'.env.production'),'utf8'));
 if(env.GITBLOG_DEPLOY_PROVIDER==='cloudflare')return {changed:false,provider:'cloudflare'};
 if(env.GITBLOG_DEPLOY_PROVIDER&&env.GITBLOG_DEPLOY_PROVIDER!=='github')throw new Error('Unknown hosting provider');
 if(!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository||'')||!token)throw new Error('GitHub repository and Pages read token are required');
 const address=siteAddress(env.PUBLIC_SITE_URL);
 if(!address.cname&&address.url.replace(/\/$/,'')!==defaultPagesUrl(repository).replace(/\/$/,''))throw new Error('PUBLIC_SITE_URL must match this repository Pages URL');
 const response=await request(`https://api.github.com/repos/${repository}/pages`,{headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'},redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Cannot read GitHub Pages configuration. Check Pages read permission and deployment settings.');
 const pages=await response.json();
 const actual=typeof pages.cname==='string'?pages.cname.toLowerCase().replace(/\.$/,''):pages.cname;
 if(actual!==(address.cname||null))throw new Error('PUBLIC_SITE_URL does not match the connected GitHub Pages domain. Complete Blog settings > Address settings first; no files were changed.');
 const path=await safePath(root,'static/CNAME');
 let before=null;try{before=await readFile(path,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
 const next=address.cname?`${address.cname}\n`:null;
 if(before===next)return {changed:false,provider:'github'};
 if(next===null)await rm(path,{force:true});else await writeFile(path,next);
 return {changed:true,provider:'github'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await syncPagesDomain(fileURLToPath(new URL('../',import.meta.url)),{repository:process.env.GITHUB_REPOSITORY,token:process.env.GITHUB_TOKEN})));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
