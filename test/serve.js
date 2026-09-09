const http=require('http'),fs=require('fs'),path=require('path');
const root=process.argv[2], port=+(process.argv[3]||8099);
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript',
 '.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png',
 '.pdf':'application/pdf','.ttf':'font/ttf','.pfb':'application/octet-stream','.map':'application/json'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p==='/')p='/index.html';
  const f=path.join(root,p);
  if(!f.startsWith(root)){res.writeHead(403).end();return}
  fs.readFile(f,(e,d)=>{
    if(e){res.writeHead(404,{'content-type':'text/plain'}).end('not found '+p);return}
    res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});
    res.end(d);
  });
}).listen(port,()=>console.log('serving '+root+' on '+port));
