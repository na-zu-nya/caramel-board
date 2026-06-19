import{r as y,j as e}from"./iframe-CTdOwArN.js";import{D as a,a as u}from"./index-BdRhSm9U.js";import"./preload-helper-Dp1pzeXC.js";import"./stack-drag-data-BO_NCe2A.js";import"./thumbnailPath-BSkYWzFt.js";import"./utils-nhH0VOCT.js";const j={title:"UI/DropZone",component:a,parameters:{layout:"centered"}},t={render:()=>{const[x,g]=y.useState([]),n=r=>g(m=>[{id:crypto.randomUUID(),message:r},...m].slice(0,5));return e.jsx(a,{onDrop:r=>n(`${r.length}件のファイルを受け取りました`),onUrlDrop:r=>n(`${r.length}件のURLを受け取りました`),className:"w-[480px]",children:e.jsxs("div",{className:"border border-dashed border-gray-400 rounded-xl px-8 py-10 text-center space-y-4 bg-white",children:[e.jsx("p",{className:"text-lg font-semibold text-gray-800",children:"ここにファイルや画像URLをドロップ"}),e.jsx("p",{className:"text-sm text-gray-500",children:"Finderやローカルファイルはもちろん、X / Pixiv などからの画像ドロップもテストできます。"}),e.jsx("p",{className:"text-xs text-gray-400",children:"ファイルが取得できる場合はファイルを優先し、取得できないときだけ複数URLを処理します。"}),e.jsx("p",{className:"text-xs text-gray-400",children:"`text/plain` / `text/uri-list` の改行区切りに加えて、Safari 系の連結URLも吸収します。"}),e.jsx("p",{className:"text-xs text-gray-400",children:"ドロップ時には `console` に `DataTransfer` の生ペイロードも種類別で出力されます。"}),e.jsx("p",{className:"text-xs text-gray-400",children:"`dragover` では `dropEffect = copy` を明示し、Cmd 併用時の再投入も検証できます。"}),e.jsx("div",{className:"text-left text-xs text-gray-500 space-y-1",children:x.map(r=>e.jsxs("div",{children:["• ",r.message]},r.id))})]})})}},s={render:()=>e.jsxs("div",{className:"w-[480px] space-y-4",children:[e.jsx(a,{onDrop:()=>{},scanProgress:{fileCount:12840,directoryCount:42,currentPath:"Reference/Characters/pose-library/standing/front-001.png"},children:e.jsx("div",{className:"rounded-xl border border-dashed border-gray-400 bg-white px-8 py-10 text-center",children:e.jsx("p",{className:"text-lg font-semibold text-gray-800",children:"フォルダ走査中の表示"})})}),e.jsx(u,{progress:{fileCount:12840,directoryCount:42,currentPath:"Reference/Characters/pose-library/standing/front-001.png"}})]})};var o,d,c;t.parameters={...t.parameters,docs:{...(o=t.parameters)==null?void 0:o.docs,source:{originalSource:`{
  render: () => {
    const [logs, setLogs] = useState<DropEventLog[]>([]);
    const pushLog = (message: string) => setLogs(prev => [{
      id: crypto.randomUUID(),
      message
    }, ...prev].slice(0, 5));
    return <DropZone onDrop={files => pushLog(\`\${files.length}件のファイルを受け取りました\`)} onUrlDrop={urls => pushLog(\`\${urls.length}件のURLを受け取りました\`)} className="w-[480px]">
        <div className="border border-dashed border-gray-400 rounded-xl px-8 py-10 text-center space-y-4 bg-white">
          <p className="text-lg font-semibold text-gray-800">ここにファイルや画像URLをドロップ</p>
          <p className="text-sm text-gray-500">
            Finderやローカルファイルはもちろん、X / Pixiv などからの画像ドロップもテストできます。
          </p>
          <p className="text-xs text-gray-400">
            ファイルが取得できる場合はファイルを優先し、取得できないときだけ複数URLを処理します。
          </p>
          <p className="text-xs text-gray-400">
            \`text/plain\` / \`text/uri-list\` の改行区切りに加えて、Safari 系の連結URLも吸収します。
          </p>
          <p className="text-xs text-gray-400">
            ドロップ時には \`console\` に \`DataTransfer\` の生ペイロードも種類別で出力されます。
          </p>
          <p className="text-xs text-gray-400">
            \`dragover\` では \`dropEffect = copy\` を明示し、Cmd 併用時の再投入も検証できます。
          </p>
          <div className="text-left text-xs text-gray-500 space-y-1">
            {logs.map(log => <div key={log.id}>• {log.message}</div>)}
          </div>
        </div>
      </DropZone>;
  }
}`,...(c=(d=t.parameters)==null?void 0:d.docs)==null?void 0:c.source}}};var p,i,l;s.parameters={...s.parameters,docs:{...(p=s.parameters)==null?void 0:p.docs,source:{originalSource:`{
  render: () => <div className="w-[480px] space-y-4">
      <DropZone onDrop={() => undefined} scanProgress={{
      fileCount: 12840,
      directoryCount: 42,
      currentPath: 'Reference/Characters/pose-library/standing/front-001.png'
    }}>
        <div className="rounded-xl border border-dashed border-gray-400 bg-white px-8 py-10 text-center">
          <p className="text-lg font-semibold text-gray-800">フォルダ走査中の表示</p>
        </div>
      </DropZone>
      <DropZoneScanProgressCard progress={{
      fileCount: 12840,
      directoryCount: 42,
      currentPath: 'Reference/Characters/pose-library/standing/front-001.png'
    }} />
    </div>
}`,...(l=(i=s.parameters)==null?void 0:i.docs)==null?void 0:l.source}}};const C=["Default","ScanningFolder"];export{t as Default,s as ScanningFolder,C as __namedExportsOrder,j as default};
