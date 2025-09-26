import{r as n,j as e}from"./iframe-DRhwVLvc.js";import{d as m,b as a,e as S,f as h,g as j,h as b,i as r,S as t}from"./side-menu-bU9aJgIW.js";import{L as M,C as f,B as g,a as v}from"./layers-BfwddKMb.js";import{H as C}from"./heart-BfoFZ8RC.js";import{F as i}from"./folder-B6GMTYHv.js";import"./preload-helper-Dp1pzeXC.js";import"./utils-DvmR7Bys.js";import"./CountBadge-Htaiq6NA.js";import"./index-ev99PfxJ.js";import"./index-f6_0lWT1.js";import"./index-SDABdUj-.js";import"./x-DUuMXKGJ.js";import"./createLucideIcon-C6efQrdH.js";import"./check-BFu3tv4p.js";const H={title:"SideMenu/SideMenu",component:m,parameters:{layout:"fullscreen"}},s={render:()=>{const[p,d]=n.useState(!0),[l,x]=n.useState("1");return e.jsx("div",{style:{height:"100vh"},children:e.jsxs(m,{open:p,onClose:()=>d(!1),title:"Menu",children:[e.jsx(a,{label:"Current Dataset",children:e.jsxs(S,{value:l,onValueChange:x,children:[e.jsx(h,{className:"w-full h-8 text-sm",children:e.jsx(j,{children:e.jsxs("span",{className:"flex items-center gap-1.5 text-xs",children:["📁 Dataset ",l]})})}),e.jsxs(b,{children:[e.jsx(r,{value:"1",children:e.jsx("span",{className:"flex items-center gap-1.5 text-xs",children:"📁 Dataset 1"})}),e.jsx(r,{value:"2",children:e.jsx("span",{className:"flex items-center gap-1.5 text-xs",children:"📁 Dataset 2"})})]})]})}),e.jsxs(a,{label:"Library",children:[e.jsx(t,{icon:M,label:"Overview",active:!0,count:120}),e.jsx(t,{icon:f,label:"Photos",count:87}),e.jsx(t,{icon:g,label:"Books"}),e.jsx(t,{icon:C,label:"Likes"})]}),e.jsxs(a,{label:"Collections",children:[e.jsx(t,{icon:i,label:"Project Alpha",count:12}),e.jsx(t,{icon:i,label:"Project Beta",count:4}),e.jsx(t,{icon:e.jsx(v,{size:15}),label:"Scratch"})]})]})})}};var o,c,u;s.parameters={...s.parameters,docs:{...(o=s.parameters)==null?void 0:o.docs,source:{originalSource:`{
  render: () => {
    const [open, setOpen] = useState(true);
    const [dataset, setDataset] = useState('1');
    return <div style={{
      height: '100vh'
    }}>
        <SideMenu open={open} onClose={() => setOpen(false)} title="Menu">
          <SideMenuGroup label="Current Dataset">
            <Select value={dataset} onValueChange={setDataset}>
              <SelectTrigger className="w-full h-8 text-sm">
                <SelectValue>
                  <span className="flex items-center gap-1.5 text-xs">📁 Dataset {dataset}</span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">
                  <span className="flex items-center gap-1.5 text-xs">📁 Dataset 1</span>
                </SelectItem>
                <SelectItem value="2">
                  <span className="flex items-center gap-1.5 text-xs">📁 Dataset 2</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </SideMenuGroup>

          <SideMenuGroup label="Library">
            <SideMenuListItem icon={Layers} label="Overview" active count={120} />
            <SideMenuListItem icon={Camera} label="Photos" count={87} />
            <SideMenuListItem icon={Book} label="Books" />
            <SideMenuListItem icon={Heart} label="Likes" />
          </SideMenuGroup>

          <SideMenuGroup label="Collections">
            <SideMenuListItem icon={Folder} label="Project Alpha" count={12} />
            <SideMenuListItem icon={Folder} label="Project Beta" count={4} />
            <SideMenuListItem icon={<XCircle size={15} />} label="Scratch" />
          </SideMenuGroup>
        </SideMenu>
      </div>;
  }
}`,...(u=(c=s.parameters)==null?void 0:c.docs)==null?void 0:u.source}}};const T=["Default"];export{s as Default,T as __namedExportsOrder,H as default};
