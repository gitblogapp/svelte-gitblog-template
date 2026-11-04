import { buildWithCoverImages } from '@gitblogapp/cli/cover-images';

await buildWithCoverImages({
  command: process.execPath,
  args: ["node_modules/vite/bin/vite.js", "build"].concat(process.argv.slice(2))
});
