import assert from 'node:assert/strict';
import {cp,mkdir,mkdtemp,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';import matter from 'gray-matter';
import {postErrors,sourceHash,translationHash} from '../scripts/lib/authoring.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),fixture=await mkdtemp(path.join(os.tmpdir(),'gitblog-membership-'));
const excluded=new Set(['.git','node_modules','.svelte-kit','build','content','.cache']);
async function write(file,value){await mkdir(path.dirname(path.join(fixture,file)),{recursive:true});await writeFile(path.join(fixture,file),value);}
try{
 await cp(root,fixture,{recursive:true,filter:file=>!path.relative(root,file).split(path.sep).some(p=>excluded.has(p))});await symlink(path.join(root,'node_modules'),path.join(fixture,'node_modules'),'dir');
 await write('.gitblog/authoring.json',JSON.stringify({schemaVersion:1,translationMode:'manual'}));
 const rows=[{slug:'preview',id:'11111111-1111-4111-8111-111111111111',preview:true,body:'Approved public preview.'},{slug:'locked',id:'22222222-2222-4222-8222-222222222222',preview:false,body:''}];
 for(const row of rows){const data={id:row.id,membershipId:row.id,access:'membership',previewAllowed:row.preview,tts:false,title:row.slug,description:row.body||'Members-only article',date:'2026-01-01',published:true,category:'Notes',tags:[]};const raw=matter.stringify(row.body,data);const source={raw,...matter(raw),path:`content/posts/${row.slug}.md`};await write(source.path,raw);assert.deepEqual(await postErrors(fixture,source),[]);
 const translated=matter(matter.stringify(row.preview?'Public translation.':'', {...data,title:`EN ${row.slug}`,description:row.preview?'Public translation.':'Members only',locale:'en',sourceLocale:'ko',sourcePath:source.path,sourceHash:sourceHash(raw),translationSource:'manual',translatedAt:'2026-01-02T00:00:00Z'}));translated.data.translationContentHash=translationHash(translated);await write(`content/translations/en/posts/${row.slug}.md`,matter.stringify(translated.content,translated.data));
 assert.ok((await postErrors(fixture,{...source,content:'ACCIDENTAL PRIVATE BODY'})).some(x=>x.includes('membership stub')));
 }
 const result=spawnSync('npm',['run','build'],{cwd:fixture,encoding:'utf8',maxBuffer:15000000,env:{...process.env,PUBLIC_SOURCE_LOCALE:'ko',PUBLIC_TRANSLATION_LOCALES:'en',PUBLIC_RELEASE_USE_TRANSLATIONS:'true',PUBLIC_SITE_URL:'https://fixture.github.io/blog',PUBLIC_SITE_REPOSITORY:'fixture/blog',PUBLIC_GISCUS_ENABLED:'false',PUBLIC_TTS_ENABLED:'true'}});assert.equal(result.status,0,result.stdout+result.stderr);
 const rss=await readFile(path.join(fixture,'build/rss.xml'),'utf8');assert.ok(rss.includes('Approved public preview.'));assert.ok(rss.includes('<hub:access>membership</hub:access>'));
 for(const locale of ['','en/'])for(const row of rows){const html=await readFile(path.join(fixture,`build/${locale}blog/${row.slug}/index.html`),'utf8');assert.ok(html.includes('membership-embed'));assert.ok(html.includes('isAccessibleForFree'));assert.ok(!html.includes('<audio'));assert.ok(!html.includes('ACCIDENTAL PRIVATE BODY'));}
 const audio=JSON.parse(await readFile(path.join(fixture,'build/.well-known/tts-input.json'),'utf8'));assert.equal(audio.posts.length,0);
 console.log('Membership build passed: public previews, locked stubs, translations, embed, SEO and no full TTS.');
}finally{await rm(fixture,{recursive:true,force:true});}
