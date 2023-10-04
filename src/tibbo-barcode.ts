import { config } from 'dotenv';
import express from 'express';
import { join } from 'path';
import { processDevices, setupDatabase } from './lib/helpers';
import { TibboDiscover } from 'tibbo-discover';
import { setupRoutes } from './lib/routes';

// Import env
config();

// Environment
const port = parseInt(process.env.APP_PORT || '8118');
const interval = parseInt(process.env.INTERVAL || '10000');
const printer = process.env.PRINTER || 'ZPL';
const devicesDB = setupDatabase();

const app = express();
const router = express.Router();
const tibboDiscover = new TibboDiscover();

// Configurations
app.set('view engine', 'pug');
app.set('views', join(__dirname, 'templates'));
app.use(express.static('generated'));

setupRoutes(router, port, devicesDB);

function scan() {
  tibboDiscover.scan().then((devices) => {
    return processDevices(devices, devicesDB, printer, port);
  });
}

app.use('/', router);
app.listen(port);
setInterval(scan, interval);
