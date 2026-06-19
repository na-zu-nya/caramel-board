import{j as e,P as c,l as n,r as a}from"./iframe-CTdOwArN.js";import{g as m}from"./ui-CFa6Bw_N.js";import{S as i}from"./selection-action-bar-DcbPoNcy.js";import{P as p}from"./pencil-DsSYsfV4.js";import{G as u}from"./git-merge-QzDPGWMz.js";import{R as d}from"./refresh-cw-CtmIqarT.js";import{T as g}from"./trash-2-DEf8fQe9.js";import{C as f}from"./clapperboard-B6MJuGTl.js";import"./preload-helper-Dp1pzeXC.js";import"./dropdown-menu-DEyA7xS7.js";import"./index-D7-VQY5Z.js";import"./index-DfQcHIfa.js";import"./index-hgXeBpwa.js";import"./index-D0QvVAqs.js";import"./Combination-B9ZnaouW.js";import"./index-BRSyriRg.js";import"./index-Do4PWZlk.js";import"./index-BsgOZtz9.js";import"./index-CA5dsyqw.js";import"./utils-nhH0VOCT.js";import"./circle-Dk719T8s.js";import"./createLucideIcon-BaknXVm6.js";import"./check-B8DV0IFK.js";import"./chevron-down-DmS_sFV9.js";import"./x-DDKB9rBG.js";const U={title:"UI/SelectionActionBar",component:i,parameters:{layout:"centered"}},v=()=>{const t=n(m);return a.useEffect(()=>(t(!0),()=>t(!1)),[t]),null},o={render:()=>e.jsxs(c,{children:[e.jsx(v,{}),e.jsx("div",{className:"relative h-48 w-full max-w-xl bg-slate-100 flex items-end justify-center p-8",children:e.jsx(i,{selectedCount:3,onClearSelection:()=>console.log("clear selection"),onExitSelectionMode:()=>console.log("exit selection"),onRemoveFromCollection:()=>console.log("remove from collection"),showRemoveFromCollection:!0,actions:[{label:"Bulk Edit",value:"bulk-edit",onSelect:()=>console.log("open bulk edit"),icon:e.jsx(p,{size:12}),group:"primary"},{label:"Merge Stacks",value:"merge-stacks",onSelect:()=>console.log("merge stacks"),icon:e.jsx(u,{size:12}),confirmMessage:"選択順の先頭スタックに残りをマージします。実行しますか？",group:"primary"},{label:"Refresh Thumbnails",value:"refresh-thumbnails",onSelect:()=>console.log("refresh thumbnails"),icon:e.jsx(d,{size:12})},{label:"Delete Stacks",value:"delete-stacks",onSelect:()=>console.log("delete stacks"),icon:e.jsx(g,{size:12}),confirmMessage:"このスタックを削除します。元に戻せません。",destructive:!0},{label:"Optimize Video",value:"optimize-video",onSelect:()=>console.log("optimize previews"),icon:e.jsx(f,{size:12})}]})})]})};var l,r,s;o.parameters={...o.parameters,docs:{...(l=o.parameters)==null?void 0:l.docs,source:{originalSource:`{
  render: () => <Provider>
      <SelectionModeActivator />
      <div className="relative h-48 w-full max-w-xl bg-slate-100 flex items-end justify-center p-8">
        <SelectionActionBar selectedCount={3} onClearSelection={() => console.log('clear selection')} onExitSelectionMode={() => console.log('exit selection')} onRemoveFromCollection={() => console.log('remove from collection')} showRemoveFromCollection actions={[{
        label: 'Bulk Edit',
        value: 'bulk-edit',
        onSelect: () => console.log('open bulk edit'),
        icon: <Pencil size={12} />,
        group: 'primary'
      }, {
        label: 'Merge Stacks',
        value: 'merge-stacks',
        onSelect: () => console.log('merge stacks'),
        icon: <GitMerge size={12} />,
        confirmMessage: '選択順の先頭スタックに残りをマージします。実行しますか？',
        group: 'primary'
      }, {
        label: 'Refresh Thumbnails',
        value: 'refresh-thumbnails',
        onSelect: () => console.log('refresh thumbnails'),
        icon: <RefreshCw size={12} />
      }, {
        label: 'Delete Stacks',
        value: 'delete-stacks',
        onSelect: () => console.log('delete stacks'),
        icon: <Trash2 size={12} />,
        confirmMessage: 'このスタックを削除します。元に戻せません。',
        destructive: true
      }, {
        label: 'Optimize Video',
        value: 'optimize-video',
        onSelect: () => console.log('optimize previews'),
        icon: <Clapperboard size={12} />
      }]} />
      </div>
    </Provider>
}`,...(s=(r=o.parameters)==null?void 0:r.docs)==null?void 0:s.source}}};const q=["Default"];export{o as Default,q as __namedExportsOrder,U as default};
