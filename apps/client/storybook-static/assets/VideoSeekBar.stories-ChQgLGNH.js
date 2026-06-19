import{j as n,r as u}from"./iframe-CTdOwArN.js";import{V as c}from"./VideoSeekBar-BcW7N0h8.js";import"./preload-helper-Dp1pzeXC.js";import"./context-menu-Cu9eYN6Y.js";import"./Combination-B9ZnaouW.js";import"./index-D0QvVAqs.js";import"./index-DfQcHIfa.js";import"./index-hgXeBpwa.js";import"./index-BRSyriRg.js";import"./index-BsgOZtz9.js";import"./utils-nhH0VOCT.js";import"./circle-Dk719T8s.js";import"./createLucideIcon-BaknXVm6.js";import"./check-B8DV0IFK.js";import"./Marker-Cdo6aJxW.js";import"./volume-x-Bg9bPUMN.js";const O={title:"Components/VideoSeekBar",component:c,args:{currentTime:42,duration:180,muted:!1,volume:.8,fps:30}},m={args:{onSeek:()=>{}},render:t=>n.jsx("div",{className:"w-[720px] bg-neutral-900 p-6",children:n.jsx(c,{...t})})},i={render:t=>{const[h,p]=u.useState(t.currentTime??42),[S,b]=u.useState(t.volume??.8),[f,l]=u.useState([{time:24,color:"white",label:""},{time:64,color:"bright-cyan",label:""},{time:122,color:"bright-yellow",label:""}]);return n.jsx("div",{className:"w-[720px] bg-neutral-900 p-6",children:n.jsx(c,{...t,currentTime:h,volume:S,onVolumeChange:b,markers:f,onSeek:p,onEditMarkerRequest:r=>p(r.time),onMoveMarkerRequest:(r,o)=>{l(s=>s.map((e,a)=>a===r?{...e,time:o}:e).sort((e,a)=>e.time-a.time))},onDeleteMarkerRequest:r=>{l(o=>o.filter((s,e)=>e!==r))},onChangeMarkerColorRequest:(r,o)=>{l(s=>s.map((e,a)=>a===r?{...e,color:o}:e))}})})}};var d,k,x;m.parameters={...m.parameters,docs:{...(d=m.parameters)==null?void 0:d.docs,source:{originalSource:`{
  args: {
    onSeek: () => {}
  },
  render: args => <div className="w-[720px] bg-neutral-900 p-6">
      <VideoSeekBar {...args} />
    </div>
}`,...(x=(k=m.parameters)==null?void 0:k.docs)==null?void 0:x.source}}};var g,v,M;i.parameters={...i.parameters,docs:{...(g=i.parameters)==null?void 0:g.docs,source:{originalSource:`{
  render: args => {
    const [currentTime, setCurrentTime] = useState(args.currentTime ?? 42);
    const [volume, setVolume] = useState(args.volume ?? 0.8);
    const [markers, setMarkers] = useState<VideoMarker[]>([{
      time: 24,
      color: 'white',
      label: ''
    }, {
      time: 64,
      color: 'bright-cyan',
      label: ''
    }, {
      time: 122,
      color: 'bright-yellow',
      label: ''
    }]);
    return <div className="w-[720px] bg-neutral-900 p-6">
        <VideoSeekBar {...args} currentTime={currentTime} volume={volume} onVolumeChange={setVolume} markers={markers} onSeek={setCurrentTime} onEditMarkerRequest={marker => setCurrentTime(marker.time)} onMoveMarkerRequest={(index, time) => {
        setMarkers(prev => prev.map((marker, markerIndex) => markerIndex === index ? {
          ...marker,
          time
        } : marker).sort((left, right) => left.time - right.time));
      }} onDeleteMarkerRequest={index => {
        setMarkers(prev => prev.filter((_, markerIndex) => markerIndex !== index));
      }} onChangeMarkerColorRequest={(index, color) => {
        setMarkers(prev => prev.map((marker, markerIndex) => markerIndex === index ? {
          ...marker,
          color
        } : marker));
      }} />
      </div>;
  }
}`,...(M=(v=i.parameters)==null?void 0:v.docs)==null?void 0:M.source}}};const z=["Default","WithMarkerActions"];export{m as Default,i as WithMarkerActions,z as __namedExportsOrder,O as default};
