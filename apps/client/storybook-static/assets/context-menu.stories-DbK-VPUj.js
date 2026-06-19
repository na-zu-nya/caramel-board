import{j as e}from"./iframe-CTdOwArN.js";import{C as m,g as x,a as l,b as t,c as d}from"./context-menu-Cu9eYN6Y.js";import{E as c}from"./ellipsis-7a9J2bws.js";import"./preload-helper-Dp1pzeXC.js";import"./Combination-B9ZnaouW.js";import"./index-D0QvVAqs.js";import"./index-DfQcHIfa.js";import"./index-hgXeBpwa.js";import"./index-BRSyriRg.js";import"./index-BsgOZtz9.js";import"./utils-nhH0VOCT.js";import"./circle-Dk719T8s.js";import"./createLucideIcon-BaknXVm6.js";import"./check-B8DV0IFK.js";const S={title:"UI/ContextMenu",component:m,parameters:{layout:"fullscreen"}},p=Array.from({length:48},(n,i)=>`Stack item ${i+1}`),r={render:()=>e.jsx("div",{className:"min-h-screen bg-gray-50 p-6",children:e.jsxs("div",{className:"mx-auto max-w-2xl rounded border border-gray-200 bg-white",children:[e.jsx("div",{className:"border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700",children:"Long list"}),e.jsx("div",{className:"max-h-[520px] overflow-y-auto",children:p.map(n=>e.jsxs(m,{children:[e.jsx(x,{asChild:!0,children:e.jsxs("button",{type:"button",className:"flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left text-sm text-gray-700 last:border-b-0 hover:bg-gray-50",children:[e.jsx("span",{className:"mr-auto",children:n}),e.jsx(c,{className:"h-4 w-4 text-gray-400"})]})}),e.jsxs(l,{className:"w-48",children:[e.jsx(t,{children:"Open"}),e.jsx(t,{children:"Info"}),e.jsx(t,{children:"Find similar"}),e.jsx(d,{}),e.jsx(t,{className:"text-red-600 focus:text-red-700",children:"Remove Stack"})]})]},n))})]})})};var a,o,s;r.parameters={...r.parameters,docs:{...(a=r.parameters)==null?void 0:a.docs,source:{originalSource:`{
  render: () => <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-2xl rounded border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
          Long list
        </div>
        <div className="max-h-[520px] overflow-y-auto">
          {items.map(item => <ContextMenu key={item}>
              <ContextMenuTrigger asChild>
                <button type="button" className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left text-sm text-gray-700 last:border-b-0 hover:bg-gray-50">
                  <span className="mr-auto">{item}</span>
                  <MoreHorizontal className="h-4 w-4 text-gray-400" />
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuItem>Open</ContextMenuItem>
                <ContextMenuItem>Info</ContextMenuItem>
                <ContextMenuItem>Find similar</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem className="text-red-600 focus:text-red-700">
                  Remove Stack
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>)}
        </div>
      </div>
    </div>
}`,...(s=(o=r.parameters)==null?void 0:o.docs)==null?void 0:s.source}}};const k=["LongListPortalLayer"];export{r as LongListPortalLayer,k as __namedExportsOrder,S as default};
