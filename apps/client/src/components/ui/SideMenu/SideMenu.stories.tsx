import type {Meta, StoryObj} from '@storybook/react';
import {Book, Camera, Folder, Heart, Layers, XCircle} from 'lucide-react';
import {useState} from 'react';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '../select';
import {SideMenu, SideMenuGroup, SideMenuListItem} from './index';

const meta: Meta<typeof SideMenu> = {
  title: 'SideMenu/SideMenu',
  component: SideMenu,
  parameters: {layout: 'fullscreen'},
};

export default meta;
type Story = StoryObj<typeof SideMenu>;

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    const [library, setLibrary] = useState('1');
    return (
      <div style={{height: '100vh'}}>
        <SideMenu open={open} onClose={() => setOpen(false)} title="Caramel Board">
          <SideMenuGroup label="Current Library">
            <Select value={library} onValueChange={setLibrary}>
              <SelectTrigger className="w-full h-8 text-sm">
                <SelectValue>
                  <span className="flex items-center gap-1.5 text-xs">📁 Library {library}</span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">
                  <span className="flex items-center gap-1.5 text-xs">📁 Library 1</span>
                </SelectItem>
                <SelectItem value="2">
                  <span className="flex items-center gap-1.5 text-xs">📁 Library 2</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </SideMenuGroup>

          <SideMenuGroup label="Library">
            <SideMenuListItem icon={Layers} label="Overview" active count={120}/>
            <SideMenuListItem icon={Camera} label="Photos" count={87}/>
            <SideMenuListItem icon={Book} label="Books"/>
            <SideMenuListItem icon={Heart} label="Likes"/>
          </SideMenuGroup>

          <SideMenuGroup label="Collections">
            <SideMenuListItem icon={Folder} label="Project Alpha" count={12}/>
            <SideMenuListItem icon={Folder} label="Project Beta" count={4}/>
            <SideMenuListItem icon={<XCircle size={15}/>} label="Scratch"/>
          </SideMenuGroup>
        </SideMenu>
      </div>
    );
  },
};

export const WithLinkTitle: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <div style={{height: '100vh'}}>
        <SideMenu
          open={open}
          onClose={() => setOpen(false)}
          title={
            <a
              href="#"
              className="inline-flex items-center rounded-sm text-gray-900 no-underline transition-colors hover:text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              onClick={(event) => event.preventDefault()}
            >
              Caramel Board
            </a>
          }
        >
          <SideMenuGroup label="Example">
            <SideMenuListItem label="Item"/>
          </SideMenuGroup>
        </SideMenu>
      </div>
    );
  },
};
