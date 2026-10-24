import {optimizeImages} from '@gitblogapp/cli/optimize-images';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export {optimizeImages};
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await optimizeImages();
