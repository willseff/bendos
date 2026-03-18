import { mount } from './index';
import { ProcMount } from './proc';
import { AgentMount } from './agents';

// Standard mounts. Import this module as a side-effect to register them:
//   import '../vfs/init';
mount('/proc',   new ProcMount());
mount('/agents', new AgentMount());
