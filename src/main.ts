import 'dotenv/config';
import { buildCli } from './cli/index';

buildCli().parse(process.argv);
