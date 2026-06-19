import{j as e,r as b}from"./iframe-CTdOwArN.js";import{A as x}from"./AuthorLinkQuickAdd-Bl2kwTVE.js";import{P as w}from"./pencil-DsSYsfV4.js";import"./preload-helper-Dp1pzeXC.js";import"./button-0AvArgaM.js";import"./index-D0QvVAqs.js";import"./index-jYrDaifw.js";import"./utils-nhH0VOCT.js";import"./input-lPVv4eq0.js";import"./popover-BSz5Y8uW.js";import"./index-D7-VQY5Z.js";import"./index-DfQcHIfa.js";import"./index-hgXeBpwa.js";import"./Combination-B9ZnaouW.js";import"./index-Do4PWZlk.js";import"./index-BsgOZtz9.js";import"./index-CA5dsyqw.js";import"./author-links-CIK2cRZl.js";import"./loader-circle-CYq-mhdJ.js";import"./createLucideIcon-BaknXVm6.js";import"./check-B8DV0IFK.js";const B={title:"Authors/AuthorLinkQuickAdd",component:x,args:{open:!1,addLabel:"リンクを追加",urlLabel:"URL",urlPlaceholder:"https://...",submitLabel:"リンクを追加",submitting:!1}};function o(r){const[f,a]=b.useState(r.open);return e.jsx("div",{className:"min-h-56 bg-gray-50 p-6",children:e.jsx(x,{...r,open:f,onOpenChange:a,onSubmit:()=>a(!1)})})}const t={render:r=>e.jsx(o,{...r})},i={args:{addLabel:"Pixiv",submitLabel:"更新",initialUrl:"https://www.pixiv.net/users/123456",showPrefix:!1,triggerTitle:"リンクを編集"},render:r=>e.jsx(o,{...r})},s={args:{addLabel:"リンクを編集",submitLabel:"更新",initialUrl:"https://www.pixiv.net/users/123456",showPrefix:!1,showTriggerLabel:!1,triggerIcon:e.jsx(w,{size:11}),triggerTitle:"リンクを編集",triggerClassName:"inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-600"},render:r=>e.jsx(o,{...r})};var n,l,p;t.parameters={...t.parameters,docs:{...(n=t.parameters)==null?void 0:n.docs,source:{originalSource:`{
  render: args => <AuthorLinkQuickAddStory {...args} />
}`,...(p=(l=t.parameters)==null?void 0:l.docs)==null?void 0:p.source}}};var m,d,c;i.parameters={...i.parameters,docs:{...(m=i.parameters)==null?void 0:m.docs,source:{originalSource:`{
  args: {
    addLabel: 'Pixiv',
    submitLabel: '更新',
    initialUrl: 'https://www.pixiv.net/users/123456',
    showPrefix: false,
    triggerTitle: 'リンクを編集'
  },
  render: args => <AuthorLinkQuickAddStory {...args} />
}`,...(c=(d=i.parameters)==null?void 0:d.docs)==null?void 0:c.source}}};var u,g,h;s.parameters={...s.parameters,docs:{...(u=s.parameters)==null?void 0:u.docs,source:{originalSource:`{
  args: {
    addLabel: 'リンクを編集',
    submitLabel: '更新',
    initialUrl: 'https://www.pixiv.net/users/123456',
    showPrefix: false,
    showTriggerLabel: false,
    triggerIcon: <Pencil size={11} />,
    triggerTitle: 'リンクを編集',
    triggerClassName: 'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-600'
  },
  render: args => <AuthorLinkQuickAddStory {...args} />
}`,...(h=(g=s.parameters)==null?void 0:g.docs)==null?void 0:h.source}}};const F=["Default","Edit","EditIconOnly"];export{t as Default,i as Edit,s as EditIconOnly,F as __namedExportsOrder,B as default};
