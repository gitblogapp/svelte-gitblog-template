import assert from 'node:assert/strict';
import {registerBlog} from '../scripts/register-blog.mjs';
const env={GITHUB_REPOSITORY:'owner/blog',GITHUB_REPOSITORY_ID:'12',GITHUB_REF:'refs/heads/main',GITHUB_TOKEN:'repo-token',ACTIONS_ID_TOKEN_REQUEST_URL:'https://oidc.example/token',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'oidc-request',GITBLOG_DEPLOYED_COMMIT:'a'.repeat(40)};
const repo={id:12,full_name:'owner/blog',default_branch:'main',private:false,archived:false,template_repository:{full_name:'gitblogapp/svelte-gitblog-template'}};
const calls=[];let failures=0;
const fetcher=async(url,options)=>{
 url=String(url);calls.push({url,options});
 if(url==='https://api.github.com/repos/owner/blog') return Response.json(repo);
 if(url.endsWith('/pages')) return Response.json({html_url:'https://owner.github.io/blog/'});
 if(url.startsWith('https://oidc.example/')) return Response.json({value:'signed-proof'});
 if(url==='https://gitblog.app/v1/ingestion/deploy-hint') return Response.json({}, {status: failures++===0?503:202});
 throw new Error('Unexpected request');
};
await registerBlog(env,fetcher,async()=>{});
const sent=calls.filter(call=>call.url.includes('/deploy-hint'));
assert.equal(sent.length,2);
assert.equal(sent[0].options.headers.Authorization,'Bearer signed-proof');
assert.equal(JSON.parse(sent[0].options.body).siteUrl,'https://owner.github.io/blog/');
assert.ok(!sent[0].options.body.includes('repo-token'));
for (const changes of [{private:true},{archived:true},{is_template:true},{template_repository:null},{default_branch:'other'}]) {
 await assert.rejects(registerBlog(env,async(url,options)=>String(url)==='https://api.github.com/repos/owner/blog'?Response.json({...repo,...changes}):fetcher(url,options),async()=>{}));
}
await assert.rejects(registerBlog({...env,GITBLOG_HUB_URL:'http://example.com'},fetcher));
console.log('App-independent registration identity, provenance, retries and token isolation passed.');
