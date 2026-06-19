import{J as b}from"./index-0TKkvVzG.js";import"./iframe-CTdOwArN.js";import"./preload-helper-Dp1pzeXC.js";import"./utils-nhH0VOCT.js";const f={title:"UI/JoyTagStatus",component:b,parameters:{layout:"padded"}},a={args:{status:"running"}},s={args:{status:"not-available",message:"No response from JoyTag health endpoint"}},e={args:{status:"not-available",isLoading:!0}},r={args:{status:"running",message:"Device: cuda"}};var t,o,n;a.parameters={...a.parameters,docs:{...(t=a.parameters)==null?void 0:t.docs,source:{originalSource:`{
  args: {
    status: 'running'
  }
}`,...(n=(o=a.parameters)==null?void 0:o.docs)==null?void 0:n.source}}};var i,c,u;s.parameters={...s.parameters,docs:{...(i=s.parameters)==null?void 0:i.docs,source:{originalSource:`{
  args: {
    status: 'not-available',
    message: 'No response from JoyTag health endpoint'
  }
}`,...(u=(c=s.parameters)==null?void 0:c.docs)==null?void 0:u.source}}};var g,m,p;e.parameters={...e.parameters,docs:{...(g=e.parameters)==null?void 0:g.docs,source:{originalSource:`{
  args: {
    status: 'not-available',
    isLoading: true
  }
}`,...(p=(m=e.parameters)==null?void 0:m.docs)==null?void 0:p.source}}};var d,l,v;r.parameters={...r.parameters,docs:{...(d=r.parameters)==null?void 0:d.docs,source:{originalSource:`{
  args: {
    status: 'running',
    message: 'Device: cuda'
  }
}`,...(v=(l=r.parameters)==null?void 0:l.docs)==null?void 0:v.source}}};const L=["Running","NotAvailable","Loading","WithMessage"];export{e as Loading,s as NotAvailable,a as Running,r as WithMessage,L as __namedExportsOrder,f as default};
