import{j as e,r as x}from"./iframe-CTdOwArN.js";import{V as o}from"./index-DAhsWDx2.js";import"./preload-helper-Dp1pzeXC.js";import"./utils-nhH0VOCT.js";import"./step-forward-Ch_EwVRS.js";import"./createLucideIcon-BaknXVm6.js";const v={title:"Components/VideoTransportControls",component:o,args:{onPlay:()=>{},onStepBackward:()=>{},onStepForward:()=>{},onShuttleStart:()=>{},onShuttleEnd:()=>{}}},r={render:a=>e.jsx("div",{className:"flex h-40 w-[520px] items-end justify-center bg-neutral-950 p-8",children:e.jsx(o,{...a})})},s={render:a=>{const[u,t]=x.useState("paused");return e.jsxs("div",{className:"flex h-40 w-[520px] flex-col items-center justify-end gap-4 bg-neutral-950 p-8 text-white",children:[e.jsx("div",{className:"font-mono text-xs text-white/70",children:u}),e.jsx(o,{...a,onPlay:()=>t("play"),onStepBackward:()=>t("step backward"),onStepForward:()=>t("step forward"),onShuttleStart:m=>t(m<0?"rewind hold":"forward hold"),onShuttleEnd:()=>t("paused")})]})}};var n,d,p;r.parameters={...r.parameters,docs:{...(n=r.parameters)==null?void 0:n.docs,source:{originalSource:`{
  render: args => <div className="flex h-40 w-[520px] items-end justify-center bg-neutral-950 p-8">
      <VideoTransportControls {...args} />
    </div>
}`,...(p=(d=r.parameters)==null?void 0:d.docs)==null?void 0:p.source}}};var i,l,c;s.parameters={...s.parameters,docs:{...(i=s.parameters)==null?void 0:i.docs,source:{originalSource:`{
  render: args => {
    const [status, setStatus] = useState('paused');
    return <div className="flex h-40 w-[520px] flex-col items-center justify-end gap-4 bg-neutral-950 p-8 text-white">
        <div className="font-mono text-xs text-white/70">{status}</div>
        <VideoTransportControls {...args} onPlay={() => setStatus('play')} onStepBackward={() => setStatus('step backward')} onStepForward={() => setStatus('step forward')} onShuttleStart={direction => setStatus(direction < 0 ? 'rewind hold' : 'forward hold')} onShuttleEnd={() => setStatus('paused')} />
      </div>;
  }
}`,...(c=(l=s.parameters)==null?void 0:l.docs)==null?void 0:c.source}}};const y=["Default","Interactive"];export{r as Default,s as Interactive,y as __namedExportsOrder,v as default};
