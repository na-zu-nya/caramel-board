import{j as r}from"./iframe-CTdOwArN.js";import{M as i}from"./Marker-Cdo6aJxW.js";import"./preload-helper-Dp1pzeXC.js";import"./utils-nhH0VOCT.js";const k={title:"Components/Marker",component:i,args:{color:"white",size:12},argTypes:{color:{control:"select",options:["white","light-gray","bright-red","bright-orange","bright-yellow","bright-green","bright-cyan","bright-blue","bright-violet","sakura","pink","hard-pink","skyblue","#EAB308"]},size:{control:"number"}}},e={},a={render:s=>r.jsx("div",{className:"inline-block p-6 bg-gray-50 rounded-md",children:r.jsxs("div",{className:"group relative w-24 h-10 border border-dashed border-gray-300 rounded-md flex items-center justify-center text-xs text-gray-500",children:["Hover here",r.jsx("div",{className:"absolute left-1/2 -translate-x-1/2 transition-transform duration-200 ease-out group-hover:scale-[1.4] will-change-transform",children:r.jsx(i,{...s})})]})}),args:{color:"white"}},t={render:()=>{const s=["white","light-gray","bright-red","bright-orange","bright-yellow","bright-green","bright-cyan","bright-blue","bright-violet","hard-pink","sakura","pink","skyblue"];return r.jsx("div",{className:"grid grid-cols-6 gap-6",children:s.map(o=>r.jsxs("div",{className:"flex items-center gap-3",children:[r.jsx(i,{color:o}),r.jsx("span",{className:"text-sm text-gray-600",children:o})]},o))})}};var l,n,c;e.parameters={...e.parameters,docs:{...(l=e.parameters)==null?void 0:l.docs,source:{originalSource:"{}",...(c=(n=e.parameters)==null?void 0:n.docs)==null?void 0:c.source}}};var d,g,m;a.parameters={...a.parameters,docs:{...(d=a.parameters)==null?void 0:d.docs,source:{originalSource:`{
  render: args => <div className="inline-block p-6 bg-gray-50 rounded-md">
      <div className="group relative w-24 h-10 border border-dashed border-gray-300 rounded-md flex items-center justify-center text-xs text-gray-500">
        Hover here
        <div className="absolute left-1/2 -translate-x-1/2 transition-transform duration-200 ease-out group-hover:scale-[1.4] will-change-transform">
          <Marker {...args} />
        </div>
      </div>
    </div>,
  args: {
    color: 'white'
  }
}`,...(m=(g=a.parameters)==null?void 0:g.docs)==null?void 0:m.source}}};var h,p,u;t.parameters={...t.parameters,docs:{...(h=t.parameters)==null?void 0:h.docs,source:{originalSource:`{
  render: () => {
    const colors = ['white', 'light-gray', 'bright-red', 'bright-orange', 'bright-yellow', 'bright-green', 'bright-cyan', 'bright-blue', 'bright-violet', 'hard-pink', 'sakura', 'pink', 'skyblue'] as const;
    return <div className="grid grid-cols-6 gap-6">
        {colors.map(c => <div key={c} className="flex items-center gap-3">
            <Marker color={c} />
            <span className="text-sm text-gray-600">{c}</span>
          </div>)}
      </div>;
  }
}`,...(u=(p=t.parameters)==null?void 0:p.docs)==null?void 0:u.source}}};const f=["Default","HoverScale","Palette"];export{e as Default,a as HoverScale,t as Palette,f as __namedExportsOrder,k as default};
