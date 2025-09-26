import{j as l,r as c}from"./iframe-DRhwVLvc.js";import{S as r}from"./side-menu-bU9aJgIW.js";import{H as u}from"./house-iFAJJLG5.js";import"./preload-helper-Dp1pzeXC.js";import"./utils-DvmR7Bys.js";import"./CountBadge-Htaiq6NA.js";import"./index-ev99PfxJ.js";import"./index-f6_0lWT1.js";import"./index-SDABdUj-.js";import"./x-DUuMXKGJ.js";import"./createLucideIcon-C6efQrdH.js";import"./check-BFu3tv4p.js";const H={title:"SideMenu/ContextMenu",component:r},e={render:()=>l.jsx(r,{icon:u,label:"Overview",enableContextMenu:!0,onOpen:()=>alert("Open")})},n={render:()=>{const[t,o]=c.useState(!1);return l.jsx(r,{icon:u,label:`Overview ${t?"(Pinned)":""}`,enableContextMenu:!0,pinnable:!0,pinned:t,onPin:()=>o(!0),onUnpin:()=>o(!1)})}};var i,s,a;e.parameters={...e.parameters,docs:{...(i=e.parameters)==null?void 0:i.docs,source:{originalSource:`{
  render: () => <SideMenuListItem icon={Home} label="Overview" enableContextMenu onOpen={() => alert('Open')} />
}`,...(a=(s=e.parameters)==null?void 0:s.docs)==null?void 0:a.source}}};var p,m,d;n.parameters={...n.parameters,docs:{...(p=n.parameters)==null?void 0:p.docs,source:{originalSource:`{
  render: () => {
    const [pinned, setPinned] = useState(false);
    return <SideMenuListItem icon={Home} label={\`Overview \${pinned ? '(Pinned)' : ''}\`} enableContextMenu pinnable pinned={pinned} onPin={() => setPinned(true)} onUnpin={() => setPinned(false)} />;
  }
}`,...(d=(m=n.parameters)==null?void 0:m.docs)==null?void 0:d.source}}};const E=["OpenOnly","PinToggle"];export{e as OpenOnly,n as PinToggle,E as __namedExportsOrder,H as default};
